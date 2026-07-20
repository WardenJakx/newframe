import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const appRoot = path.resolve(__dirname, '..')
const repositoryRoot = path.resolve(appRoot, '../..')
const sourceExtensions = new Set(['.css', '.js', '.jsx', '.mjs', '.styl', '.ts', '.tsx'])

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
    .filter(
      (file) =>
        sourceExtensions.has(path.extname(file)) &&
        !file.includes(`${path.sep}dist${path.sep}`) &&
        !file.includes(path.join('packages', 'ui', 'src', 'styled-system')) &&
        !file.includes(path.join('apps', 'newframe', 'resources', 'styled-system')) &&
        !file.includes(path.join('apps', 'newframe-extension', 'src', 'styled-system'))
    )
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
const migratedPilotFiles = new Set([
  path.join('apps', 'newframe', 'app', 'tray', 'Home', 'components', 'HomeHeaderView.tsx'),
  path.join('apps', 'newframe', 'app', 'tray', 'Home', 'components', 'HomeMenuView.tsx')
])
const migratedSharedSideTrayFiles = new Set([
  path.join('apps', 'newframe', 'resources', 'Components', 'ChainTokenIcon.tsx'),
  path.join('apps', 'newframe', 'resources', 'Components', 'BalanceRange.tsx'),
  path.join('apps', 'newframe', 'resources', 'Components', 'TokenOptionRow.tsx'),
  path.join('apps', 'newframe', 'resources', 'Components', 'TokenSelector.tsx')
])
const migratedSideTrayFiles = (file: string) =>
  under(path.join('apps', 'newframe', 'app', 'sidetray'))(file) || migratedSharedSideTrayFiles.has(file)
const extensionCompositionFiles = new Set([
  path.join('apps', 'newframe-extension', 'src', 'settings', 'ChoiceGrid.tsx'),
  path.join('apps', 'newframe-extension', 'src', 'settings', 'SettingsPanel.tsx')
])
const migratedExtensionSettingsFiles = (file: string) =>
  under(path.join('apps', 'newframe-extension', 'src', 'settings'))(file) &&
  !extensionCompositionFiles.has(file)
const uiSource = under(path.join('packages', 'ui', 'src'))
const primitiveRoot = path.join('packages', 'ui', 'src', 'primitives')

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

    if (
      file.endsWith('.css') &&
      (uiSource(file) ||
        under(path.join('apps', 'newframe', 'app', 'tray'))(file) ||
        under(path.join('apps', 'newframe', 'resources', 'Components'))(file) ||
        under(path.join('apps', 'newframe-extension', 'src', 'settings'))(file))
    ) {
      violations.push(`${file}: component styles must be authored with Panda in the owning TypeScript file`)
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

    if (migratedPilotFiles.has(file) || migratedSideTrayFiles(file) || migratedExtensionSettingsFiles(file)) {
      const rawElement = source.match(
        /<(?:a|button|canvas|div|footer|form|h[1-6]|header|img|input|label|main|option|output|p|section|select|small|span|strong|svg|table|textarea)\b/
      )
      if (rawElement?.index !== undefined) {
        violations.push(
          `${file}:${lineNumber(source, rawElement.index)} migrated UI must render through packages/ui`
        )
      }
      const stylingEscape = source.match(/\b(?:className|style)=/)
      if (stylingEscape?.index !== undefined) {
        violations.push(
          `${file}:${lineNumber(source, stylingEscape.index)} migrated UI cannot pass styling escape hatches`
        )
      }
    }

    if (uiSource(file)) {
      if (under(path.join('packages', 'ui', 'src', 'components'))(file)) {
        violations.push(
          `${file}: packages/ui is reserved for primitives; application compositions belong to their owning app`
        )
      }

      const applicationImport = source.match(
        /from\s+['"][^'"]*(?:apps\/newframe|apps\/newframe-extension)['"]|from\s+['"][.]{2}\/[^'"]*apps\//
      )
      if (applicationImport?.index !== undefined) {
        violations.push(
          `${file}:${lineNumber(source, applicationImport.index)} packages/ui cannot import an application`
        )
      }

      if (under(path.join('packages', 'ui', 'src', 'primitives'))(file)) {
        if (path.dirname(file) !== primitiveRoot) {
          violations.push(`${file}: UI primitives must be directly discoverable in src/primitives`)
        }

        if (file.endsWith('.css')) {
          violations.push(`${file}: primitive styles must be colocated in the component TypeScript file`)
        }

        const componentImport = source.match(/from\s+['"][^'"]*components\//)
        if (componentImport?.index !== undefined) {
          violations.push(
            `${file}:${lineNumber(source, componentImport.index)} UI primitives cannot depend on composed components`
          )
        }
      }

      const legacyVariantRegistry = source.match(/\b(?:AssetSelectorVariant|PanelVariant)\b/)
      if (legacyVariantRegistry?.index !== undefined) {
        violations.push(
          `${file}:${lineNumber(source, legacyVariantRegistry.index)} UI primitives cannot expose application-shaped variant registries`
        )
      }

      const inheritedNativeProps = source.match(
        /\b(?:HTMLAttributes|ButtonHTMLAttributes|InputHTMLAttributes|SelectHTMLAttributes|ImgHTMLAttributes|AnchorHTMLAttributes)\s*</
      )
      if (inheritedNativeProps?.index !== undefined) {
        violations.push(
          `${file}:${lineNumber(source, inheritedNativeProps.index)} UI props must opt into supported behavior instead of inheriting native element props`
        )
      }

      const legacyRecipe = source.match(/from\s+['"]class-variance-authority['"]/)
      if (legacyRecipe?.index !== undefined) {
        violations.push(
          `${file}:${lineNumber(source, legacyRecipe.index)} UI recipes must use the token-aware Panda runtime`
        )
      }

      if (
        file.endsWith('.css') ||
        (under(primitiveRoot)(file) && file.endsWith('.tsx') && file !== path.join(primitiveRoot, 'Icon.tsx'))
      ) {
        const rawUnit = source.match(/(?<![A-Za-z0-9_-])-?\d+(?:\.\d+)?(?:px|rem|em|ms|s|deg)\b/)
        if (rawUnit?.index !== undefined) {
          violations.push(
            `${file}:${lineNumber(source, rawUnit.index)} UI recipes must reference typed design tokens instead of raw unit values`
          )
        }
      }

      const componentTypography = source.match(/\bfont(?:Family|Size|Weight)\s*:/)
      if (
        componentTypography?.index !== undefined &&
        under(primitiveRoot)(file) &&
        file !== path.join(primitiveRoot, 'Text.tsx')
      ) {
        violations.push(
          `${file}:${lineNumber(source, componentTypography.index)} primitives must compose the shared Text recipe`
        )
      }
    }
  }

  for (const { file } of files) {
    if (!file.endsWith('.styl')) continue
    violations.push(`${file}: Stylus is forbidden; migrate the owning surface to the design system`)
  }

  if (violations.length === 0) return
  console.error(`Architecture violations:\n${violations.map((violation) => `- ${violation}`).join('\n')}`)
  process.exit(1)
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})
