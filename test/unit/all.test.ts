import { expect, test } from 'bun:test'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dir, '../..')

test(
  'monorepo unit tests',
  async () => {
    const tests = Bun.spawn(['bun', 'run', 'test:unit'], {
      cwd: repoRoot,
      stdin: 'inherit',
      stdout: 'inherit',
      stderr: 'inherit'
    })

    expect(await tests.exited).toBe(0)
  },
  10 * 60 * 1000
)
