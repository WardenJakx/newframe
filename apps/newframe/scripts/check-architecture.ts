import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const appRoot = path.resolve(__dirname, '..')
const repositoryRoot = path.resolve(appRoot, '../..')
const sourceExtensions = new Set(['.js', '.jsx', '.mjs', '.ts', '.tsx'])

type SourceFile = { file: string; source: string }
type Rule = { files: (file: string) => boolean; pattern: RegExp; message: string }

async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  return (
    await Promise.all(
      entries.map((entry) => {
        const target = path.join(directory, entry.name)
        return entry.isDirectory() ? walk(target) : [target]
      })
    )
  ).flat()
}

async function sourceFiles() {
  const roots = [
    path.join(appRoot, 'app'),
    path.join(appRoot, 'main'),
    path.join(appRoot, 'resources'),
    path.join(appRoot, 'test'),
    path.join(repositoryRoot, 'apps/newframe-extension/src')
  ]
  const optionalRoots = [path.join(repositoryRoot, 'packages')].filter(existsSync)
  const files = (await Promise.all([...roots, ...optionalRoots].map(walk)))
    .flat()
    .filter((file) => sourceExtensions.has(path.extname(file)))
  const manifests = [
    path.join(repositoryRoot, 'package.json'),
    path.join(repositoryRoot, 'bun.lock'),
    path.join(appRoot, 'package.json'),
    path.join(repositoryRoot, 'apps/newframe-extension/package.json')
  ]

  return Promise.all(
    [...files, ...manifests].map(
      async (file): Promise<SourceFile> => ({
        file: path.relative(repositoryRoot, file),
        source: await readFile(file, 'utf8')
      })
    )
  )
}

const under = (directory: string) => (file: string) => file.startsWith(directory + path.sep)
const isTestFile = (file: string) => /(?:^|\/)[^/]+\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file)
const productionRenderer = (file: string) =>
  !isTestFile(file) &&
  (under(path.join('apps', 'newframe', 'app'))(file) ||
    (under(path.join('apps', 'newframe', 'resources'))(file) &&
      file !== path.join('apps', 'newframe', 'resources', 'bridge', 'index.ts')))
const productionMain = under(path.join('apps', 'newframe', 'main'))
const anyFile = () => true

const restorePackage = ['react', 'restore'].join('-')
const genericActionChannel = ['tray', 'action'].join(':')
const genericRpcChannel = ['main', 'rpc'].join(':')
const rules: Rule[] = [
  {
    files: anyFile,
    pattern: new RegExp(`${restorePackage}|Restore\\.connect`),
    message: 'Restore is not an application state dependency'
  },
  {
    files: anyFile,
    pattern: new RegExp(`${genericActionChannel}|${genericRpcChannel}`),
    message: 'generic action and RPC channels are forbidden'
  },
  {
    files: productionRenderer,
    pattern: /\blink\.(?:emit|invoke|on|rpc|send)\b|__NEWFRAME_HOST__\.(?:invoke|rpc|send)\b/,
    message: 'renderer code must use typed commands, queries, and state connections'
  },
  {
    files: productionRenderer,
    pattern: /\buseSyncExternalStore\b/,
    message: 'renderer mirrors must use Zustand store mechanics'
  },
  {
    files: productionRenderer,
    pattern: /\bclass\s+\w+\s+extends\s+(?:React\.)?(?:Pure)?Component\b/,
    message: 'React components must be functions'
  },
  {
    files: productionMain,
    pattern: /\bipcMain\.on\b/,
    message: 'application IPC must use typed asynchronous handlers'
  }
]

function lineNumber(source: string, index: number) {
  return source.slice(0, index).split('\n').length
}

async function main() {
  const files = await sourceFiles()
  const violations: string[] = []

  for (const { file, source } of files) {
    for (const rule of rules) {
      if (!rule.files(file)) continue
      const match = source.match(rule.pattern)
      if (match?.index !== undefined)
        violations.push(`${file}:${lineNumber(source, match.index)} ${rule.message}`)
    }

    if (productionRenderer(file) && /\bipcRenderer\b/.test(source)) {
      violations.push(`${file}: raw ipcRenderer is restricted to the preload bridge`)
    }

    if (/\bipcMain\.handle\b/.test(source)) {
      const allowed = new Set([
        path.join('apps', 'newframe', 'main', 'ipc', 'operations.ts'),
        path.join('apps', 'newframe', 'main', 'ipc', 'stateStream.ts')
      ])
      if (!allowed.has(file)) violations.push(`${file}: ipcMain.handle is restricted to typed IPC modules`)
    }

    if (productionMain(file) && /\bwebContents\.send\b/.test(source)) {
      const stateStream = path.join('apps', 'newframe', 'main', 'ipc', 'stateStream.ts')
      if (file !== stateStream) {
        violations.push(`${file}: webContents.send is restricted to the typed state stream`)
      }
    }
  }

  if (violations.length === 0) return
  console.error(`Architecture violations:\n${violations.map((violation) => `- ${violation}`).join('\n')}`)
  process.exit(1)
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})
