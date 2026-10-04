import { readdirSync } from 'node:fs'
import path from 'node:path'

const appRoot = path.resolve(import.meta.dirname, '..')
const rendererRoots = [path.join(appRoot, 'src', 'trays'), path.join(appRoot, 'test', 'extension')]

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name)
    return entry.isDirectory() ? walk(absolute) : [absolute]
  })
}

const relative = (absolute: string) => `./${path.relative(appRoot, absolute).split(path.sep).join('/')}`
const rendererTests = rendererRoots
  .flatMap(walk)
  .filter((file) => /\.test\.tsx?$/.test(file))
  .sort()
const unitTests = rendererTests.filter((file) => file.endsWith('.test.ts')).map(relative)
const domTests = rendererTests.filter((file) => file.endsWith('.test.tsx')).map(relative)

async function run(files: string[], preload?: string) {
  if (files.length === 0) {
    return 0
  }

  const command = [
    'bun',
    'test',
    '--parallel=4',
    '--isolate',
    ...(preload ? ['--preload', preload] : []),
    ...files
  ]
  const child = Bun.spawn(command, {
    cwd: appRoot,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit'
  })

  return child.exited
}

const unitExit = await run(unitTests)
const domExit = unitExit === 0 ? await run(domTests, './test/support/dom.preload.ts') : unitExit

process.exitCode = domExit
