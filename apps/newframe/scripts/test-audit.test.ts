import { afterEach, expect, it } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

let temporaryDirectory: string | undefined

afterEach(() => {
  if (temporaryDirectory) {
    rmSync(temporaryDirectory, { force: true, recursive: true })
    temporaryDirectory = undefined
  }
})

it('fails --check with an individual diagnostic for every exceeded ratchet', async () => {
  temporaryDirectory = mkdtempSync(path.join(tmpdir(), 'newframe-test-audit-'))
  const baselinePath = path.join(temporaryDirectory, 'baseline.json')
  writeFileSync(
    baselinePath,
    JSON.stringify({
      maximum: {
        tests: -1,
        moduleMocks: -1,
        callbackTests: -1,
        mockCallAssertions: -1,
        noAssertionFiles: -1,
        misplacedScenarioFiles: -1
      }
    })
  )
  const child = Bun.spawn(['bun', './scripts/test-audit.ts', '--check', `--baseline=${baselinePath}`], {
    cwd: path.resolve(import.meta.dirname, '..'),
    stderr: 'pipe',
    stdout: 'pipe'
  })
  const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()])

  expect(exitCode).toBe(1)
  for (const metric of [
    'tests',
    'moduleMocks',
    'callbackTests',
    'mockCallAssertions',
    'noAssertionFiles',
    'misplacedScenarioFiles'
  ]) {
    expect(stderr).toContain(`${metric}:`)
  }
})
