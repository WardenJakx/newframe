import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const appRoot = process.cwd()
const testRoot = join(appRoot, 'test', 'main')

function findTests(dir: string): string[] {
  return readdirSync(dir)
    .flatMap((entry) => {
      const path = join(dir, entry)
      return statSync(path).isDirectory() ? findTests(path) : [path]
    })
    .filter((path) => path.endsWith('.test.ts'))
}

const tests = findTests(testRoot)
  .map((path) => relative(appRoot, path))
  .sort()

const failed: string[] = []

async function main() {
  for (const testFile of tests) {
    const proc = Bun.spawn({
      cmd: ['bun', 'test', '--preload', './test/bun.setup.ts', '--timeout', '1000', testFile],
      stdout: 'inherit',
      stderr: 'inherit'
    })

    const exitCode = await proc.exited
    if (exitCode !== 0) failed.push(testFile)
  }

  if (failed.length > 0) {
    console.error(`\nFailed main test files:\n${failed.map((file) => `- ${file}`).join('\n')}`)
    process.exit(1)
  }
}

main()
