import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  nextCalVer,
  prepareRelease,
  releaseTagsFromGitOutput,
  updateChangelog,
  utcCalVerDate
} from './prepare-release'

const temporaryRoots: string[] = []

function temporaryRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'newframe-release-test-'))
  temporaryRoots.push(root)
  return root
}

function seedProduct(root: string, product: 'desktop' | 'extension'): void {
  const app =
    product === 'desktop'
      ? path.join(root, 'apps/newframe')
      : path.join(root, 'apps/newframe-extension')
  mkdirSync(path.join(app, 'src'), { recursive: true })
  writeFileSync(path.join(app, 'package.json'), '{\n  "name": "test",\n  "version": "0.0.1"\n}\n')
  writeFileSync(path.join(app, 'CHANGELOG.md'), '# Changelog\n\n## 0.0.1\n\n- Baseline.\n')
  if (product === 'extension') {
    writeFileSync(
      path.join(app, 'src/manifest.json'),
      '{\n  "name": "Test",\n  "version": "0.0.1",\n  "manifest_version": 3\n}\n'
    )
  }
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('CalVer calculation', () => {
  test('uses the UTC year and MDD date without leading zeroes', () => {
    expect(utcCalVerDate(new Date('2026-01-05T23:59:59-05:00'))).toEqual({
      year: '2026',
      datePart: '106'
    })
    expect(utcCalVerDate(new Date('2026-11-05T00:00:00Z'))).toEqual({
      year: '2026',
      datePart: '1105'
    })
  })

  test('maintains independent product counters for the current UTC date', () => {
    const date = new Date('2026-07-27T12:00:00Z')
    const tags = ['desktop-v2026.727.2', 'extension-v2026.727.8']
    expect(nextCalVer('desktop', tags, date)).toBe('2026.727.3')
    expect(nextCalVer('extension', tags, date)).toBe('2026.727.9')
  })

  test('includes origin tags that are missing from a stale local clone', () => {
    const tags = releaseTagsFromGitOutput(
      'extension',
      'extension-v2026.727.1\n',
      [
        '1111111111111111111111111111111111111111\trefs/tags/extension-v2026.727.1',
        '2222222222222222222222222222222222222222\trefs/tags/extension-v2026.727.4'
      ].join('\n')
    )

    expect(nextCalVer('extension', tags, new Date('2026-07-27T12:00:00Z'))).toBe('2026.727.5')
  })

  test('ignores other dates and malformed tags', () => {
    const date = new Date('2026-07-27T12:00:00Z')
    const tags = [
      'desktop-v2026.726.99',
      'desktop-v2026.0727.9',
      'desktop-v2026.727.03',
      'desktop-v2026.727.0',
      'desktop-v2026.727.65536',
      'desktop-v2026.727.4-extra',
      'desktop-vwat'
    ]
    expect(nextCalVer('desktop', tags, date)).toBe('2026.727.1')
  })

  test('fails once a date counter has reached 65535', () => {
    expect(() =>
      nextCalVer('desktop', ['desktop-v2026.727.65535'], new Date('2026-07-27T12:00:00Z'))
    ).toThrow('has reached counter 65535')
  })
})

describe('release file preparation', () => {
  test('updates only desktop metadata when preparing desktop', () => {
    const root = temporaryRoot()
    seedProduct(root, 'desktop')
    seedProduct(root, 'extension')
    const extensionBefore = readFileSync(
      path.join(root, 'apps/newframe-extension/package.json'),
      'utf8'
    )

    const result = prepareRelease(root, 'desktop', new Date('2026-07-27T12:00:00Z'), [])

    expect(result).toEqual({ version: '2026.727.1', tag: 'desktop-v2026.727.1' })
    expect(JSON.parse(readFileSync(path.join(root, 'apps/newframe/package.json'), 'utf8')).version).toBe(
      '2026.727.1'
    )
    expect(readFileSync(path.join(root, 'apps/newframe/CHANGELOG.md'), 'utf8')).toContain(
      '## 2026.727.1\n\n- Describe changes before release.'
    )
    expect(readFileSync(path.join(root, 'apps/newframe-extension/package.json'), 'utf8')).toBe(
      extensionBefore
    )
  })

  test('keeps extension package and manifest versions synchronized', () => {
    const root = temporaryRoot()
    seedProduct(root, 'extension')

    prepareRelease(root, 'extension', new Date('2026-07-27T12:00:00Z'), [
      'extension-v2026.727.4'
    ])

    const packageVersion = JSON.parse(
      readFileSync(path.join(root, 'apps/newframe-extension/package.json'), 'utf8')
    ).version
    const manifestVersion = JSON.parse(
      readFileSync(path.join(root, 'apps/newframe-extension/src/manifest.json'), 'utf8')
    ).version
    expect(packageVersion).toBe('2026.727.5')
    expect(manifestVersion).toBe(packageVersion)
  })

  test('is byte-for-byte safe to rerun when tags have not changed', () => {
    const root = temporaryRoot()
    seedProduct(root, 'extension')
    const date = new Date('2026-07-27T12:00:00Z')

    prepareRelease(root, 'extension', date, [])
    const paths = [
      path.join(root, 'apps/newframe-extension/package.json'),
      path.join(root, 'apps/newframe-extension/src/manifest.json'),
      path.join(root, 'apps/newframe-extension/CHANGELOG.md')
    ]
    const firstRun = paths.map((file) => readFileSync(file, 'utf8'))

    prepareRelease(root, 'extension', date, [])

    expect(paths.map((file) => readFileSync(file, 'utf8'))).toEqual(firstRun)
    expect(
      readFileSync(path.join(root, 'apps/newframe-extension/CHANGELOG.md'), 'utf8').match(
        /^## 2026\.727\.1$/gm
      )
    ).toHaveLength(1)
  })

  test('fills an existing empty changelog entry without duplicating its heading', () => {
    const changelog = '# Changelog\n\n## 2026.727.1\n\n## 0.0.1\n\n- Baseline.\n'
    const updated = updateChangelog(changelog, '2026.727.1')
    expect(updated.match(/^## 2026\.727\.1$/gm)).toHaveLength(1)
    expect(updated).toContain('## 2026.727.1\n\n- Describe changes before release.')
  })
})
