import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const temporaryDirectories: string[] = []

function temporaryFile(name: string, contents: string) {
  const directory = mkdtempSync(path.join(tmpdir(), 'newframe-coverage-check-'))
  temporaryDirectories.push(directory)
  const file = path.join(directory, name)
  writeFileSync(file, contents)
  return file
}

function manifest(patterns: string[]) {
  return JSON.stringify({
    groups: [
      {
        name: 'critical',
        rationale: 'test fixture',
        patterns,
        minimum: { lines: 0, functions: 0 }
      }
    ]
  })
}

function manifestWithMinimum(patterns: string[], minimum: { functions: number; lines: number }) {
  return JSON.stringify({
    groups: [{ name: 'critical', rationale: 'test fixture', patterns, minimum }]
  })
}

function lcov(sources: Array<string | { name: string; lineHits?: number; measurable?: boolean }>) {
  return sources
    .map((source) => {
      const { name, lineHits = 1, measurable = true } = typeof source === 'string' ? { name: source } : source
      return measurable
        ? `SF:${name}\nFN:1,covered\nFNDA:${lineHits},covered\nFNF:1\nFNH:${lineHits > 0 ? 1 : 0}\nDA:1,${lineHits}\nend_of_record\n`
        : `SF:${name}\nend_of_record\n`
    })
    .join('')
}

async function runChecker(lcovPath: string, manifestPath: string) {
  const process = Bun.spawn(['bun', './scripts/check-critical-coverage.ts', lcovPath, manifestPath], {
    cwd: path.resolve(import.meta.dirname, '..'),
    stderr: 'pipe',
    stdout: 'pipe'
  })

  const [exitCode, stderr, stdout] = await Promise.all([
    process.exited,
    new Response(process.stderr).text(),
    new Response(process.stdout).text()
  ])
  return { exitCode, stderr, stdout }
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe('critical coverage manifest integrity', () => {
  it('fails each stale or LCOV-omitted pattern independently', async () => {
    const lcovPath = temporaryFile('lcov.info', lcov(['src/features/access-control/main/authority.ts']))
    const manifestPath = temporaryFile(
      'manifest.json',
      manifest([
        'src/features/access-control/main/authority.ts',
        'src/platform/secrets/vault.ts',
        'src/features/access-control/main/deleted-risk.ts'
      ])
    )

    const result = await runChecker(lcovPath, manifestPath)

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain(
      'pattern "src/platform/secrets/vault.ts" matched "src/platform/secrets/vault.ts", but it is missing from LCOV'
    )
    expect(result.stderr).toContain(
      'pattern "src/features/access-control/main/deleted-risk.ts" matches no existing production source'
    )
  })

  it('requires every production file matched by a glob to appear in LCOV', async () => {
    const lcovPath = temporaryFile(
      'lcov.info',
      lcov(['src/platform/signing/signatures/digests.ts'])
    )
    const manifestPath = temporaryFile(
      'manifest.json',
      manifest(['src/platform/signing/signatures/*.ts'])
    )

    const result = await runChecker(lcovPath, manifestPath)

    expect(result.exitCode).toBe(1)
    for (const source of [
      'src/platform/signing/signatures/erc7730.ts',
      'src/platform/signing/signatures/index.ts',
      'src/platform/signing/signatures/types.ts'
    ]) {
      expect(result.stderr).toContain(
        `pattern "src/platform/signing/signatures/*.ts" matched "${source}", but it is missing from LCOV`
      )
    }
  })

  it('reports zero-execution and non-measurable LCOV records individually', async () => {
    const lcovPath = temporaryFile(
      'lcov.info',
      lcov([
        { name: 'src/features/access-control/main/authority.ts', lineHits: 0 },
        { name: 'src/platform/secrets/vault.ts', measurable: false }
      ])
    )
    const manifestPath = temporaryFile(
      'manifest.json',
      manifest(['src/features/access-control/main/authority.ts', 'src/platform/secrets/vault.ts'])
    )

    const result = await runChecker(lcovPath, manifestPath)

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain(
      'pattern "src/features/access-control/main/authority.ts" matched "src/features/access-control/main/authority.ts", but LCOV reports zero executed lines'
    )
    expect(result.stderr).toContain(
      'pattern "src/platform/secrets/vault.ts" matched "src/platform/secrets/vault.ts", but LCOV contains no measurable lines or functions'
    )
  })

  it('uses the strongest complete record when isolated Bun reports instrument one source differently', async () => {
    const lcovPath = temporaryFile(
      'lcov.info',
      [
        'SF:src/features/access-control/main/authority.ts\nFN:1,covered\nFNDA:1,covered\nFNF:1\nFNH:1\nDA:1,1\nend_of_record\n',
        'SF:src/features/access-control/main/authority.ts\nFN:1,covered\nFNDA:1,covered\nFNF:1\nFNH:1\nDA:1,1\nDA:999,0\nend_of_record\n'
      ].join('')
    )
    const manifestPath = temporaryFile(
      'manifest.json',
      manifestWithMinimum(['src/features/access-control/main/authority.ts'], {
        lines: 100,
        functions: 100
      })
    )

    const result = await runChecker(lcovPath, manifestPath)

    expect(result).toMatchObject({ exitCode: 0, stderr: '' })
  })

  it('accepts a manifest only when every declared pattern exists and appears in LCOV', async () => {
    const sources = [
      'src/features/access-control/main/authority.ts',
      'src/platform/secrets/vault.ts'
    ]
    const lcovPath = temporaryFile('lcov.info', lcov(sources))
    const manifestPath = temporaryFile('manifest.json', manifest(sources))

    const result = await runChecker(lcovPath, manifestPath)

    expect(result).toMatchObject({
      exitCode: 0,
      stderr: ''
    })
    expect(result.stdout).toContain('Critical risk coverage gates passed.')
  })
})
