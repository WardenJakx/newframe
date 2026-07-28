import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  nextCalVer,
  parseCliOptions,
  prepareRelease,
  releaseTagsFromRemoteOutput,
  updateChangelog,
  utcCalVerDate,
  writeGithubOutput
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

  test('uses only current origin tags', () => {
    const tags = releaseTagsFromRemoteOutput(
      'extension',
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
    const extensionManifestBefore = readFileSync(
      path.join(root, 'apps/newframe-extension/src/manifest.json'),
      'utf8'
    )
    const extensionChangelogBefore = readFileSync(
      path.join(root, 'apps/newframe-extension/CHANGELOG.md'),
      'utf8'
    )

    const result = prepareRelease(
      root,
      'desktop',
      new Date('2026-07-27T12:00:00Z'),
      [],
      '- Fixed signing.\n- Improved updates.'
    )

    expect(result).toEqual({
      product: 'desktop',
      version: '2026.727.1',
      tag: 'desktop-v2026.727.1'
    })
    expect(JSON.parse(readFileSync(path.join(root, 'apps/newframe/package.json'), 'utf8')).version).toBe(
      '2026.727.1'
    )
    expect(readFileSync(path.join(root, 'apps/newframe/CHANGELOG.md'), 'utf8')).toContain(
      '## 2026.727.1\n\n- Fixed signing.\n- Improved updates.'
    )
    expect(readFileSync(path.join(root, 'apps/newframe-extension/package.json'), 'utf8')).toBe(
      extensionBefore
    )
    expect(
      readFileSync(path.join(root, 'apps/newframe-extension/src/manifest.json'), 'utf8')
    ).toBe(extensionManifestBefore)
    expect(readFileSync(path.join(root, 'apps/newframe-extension/CHANGELOG.md'), 'utf8')).toBe(
      extensionChangelogBefore
    )
  })

  test('keeps extension package and manifest versions synchronized', () => {
    const root = temporaryRoot()
    seedProduct(root, 'desktop')
    seedProduct(root, 'extension')
    const desktopPackageBefore = readFileSync(path.join(root, 'apps/newframe/package.json'), 'utf8')
    const desktopChangelogBefore = readFileSync(
      path.join(root, 'apps/newframe/CHANGELOG.md'),
      'utf8'
    )

    prepareRelease(
      root,
      'extension',
      new Date('2026-07-27T12:00:00Z'),
      ['extension-v2026.727.4'],
      'Extension notes.'
    )

    const packageVersion = JSON.parse(
      readFileSync(path.join(root, 'apps/newframe-extension/package.json'), 'utf8')
    ).version
    const manifestVersion = JSON.parse(
      readFileSync(path.join(root, 'apps/newframe-extension/src/manifest.json'), 'utf8')
    ).version
    expect(packageVersion).toBe('2026.727.5')
    expect(manifestVersion).toBe(packageVersion)
    expect(readFileSync(path.join(root, 'apps/newframe/package.json'), 'utf8')).toBe(
      desktopPackageBefore
    )
    expect(readFileSync(path.join(root, 'apps/newframe/CHANGELOG.md'), 'utf8')).toBe(
      desktopChangelogBefore
    )
  })

  test('is byte-for-byte safe to rerun when tags have not changed', () => {
    const root = temporaryRoot()
    seedProduct(root, 'extension')
    const date = new Date('2026-07-27T12:00:00Z')

    prepareRelease(root, 'extension', date, [], 'Handles `$`, quotes, and 100%.\n\nMultiple lines.')
    const paths = [
      path.join(root, 'apps/newframe-extension/package.json'),
      path.join(root, 'apps/newframe-extension/src/manifest.json'),
      path.join(root, 'apps/newframe-extension/CHANGELOG.md')
    ]
    const firstRun = paths.map((file) => readFileSync(file, 'utf8'))

    prepareRelease(root, 'extension', date, [], 'Handles `$`, quotes, and 100%.\n\nMultiple lines.')

    expect(paths.map((file) => readFileSync(file, 'utf8'))).toEqual(firstRun)
    expect(
      readFileSync(path.join(root, 'apps/newframe-extension/CHANGELOG.md'), 'utf8').match(
        /^## 2026\.727\.1$/gm
      )
    ).toHaveLength(1)
  })

  test('replaces an existing entry with explicit notes without duplicating its heading', () => {
    const changelog = '# Changelog\n\n## 2026.727.1\n\n- Old notes.\n\n## 0.0.1\n\n- Baseline.\n'
    const updated = updateChangelog(changelog, '2026.727.1', 'Line one.\n\nLine `$` 100%.')
    expect(updated.match(/^## 2026\.727\.1$/gm)).toHaveLength(1)
    expect(updated).toContain('## 2026.727.1\n\nLine one.\n\nLine `$` 100%.')
    expect(updated).not.toContain('Old notes.')
  })

  test('preserves Markdown headings and shell-significant text deterministically', () => {
    const notes = 'Cost is `$5` (100%).\r\n\r\n## Details\r\n\r\nUse "quoted" values & symbols.'
    const first = updateChangelog('# Changelog\n', '2026.727.1', notes)
    const second = updateChangelog(first, '2026.727.1', notes)

    expect(second).toBe(first)
    expect(second).toContain(
      'Cost is `$5` (100%).\n\n## Details\n\nUse "quoted" values & symbols.'
    )
  })

  test('rejects empty release notes before changing files', () => {
    const root = temporaryRoot()
    seedProduct(root, 'desktop')
    const packagePath = path.join(root, 'apps/newframe/package.json')
    const before = readFileSync(packagePath, 'utf8')

    expect(() =>
      prepareRelease(root, 'desktop', new Date('2026-07-27T12:00:00Z'), [], ' \n ')
    ).toThrow('must contain non-whitespace text')
    expect(readFileSync(packagePath, 'utf8')).toBe(before)
  })
})

describe('workflow interface', () => {
  test('requires explicit notes and GitHub output paths', () => {
    expect(
      parseCliOptions([
        'desktop',
        '--notes-file',
        '/tmp/notes.md',
        '--github-output',
        '/tmp/github-output'
      ])
    ).toEqual({
      product: 'desktop',
      notesFile: '/tmp/notes.md',
      githubOutput: '/tmp/github-output'
    })
    expect(() => parseCliOptions(['desktop', '--notes-file', '/tmp/notes.md'])).toThrow(
      'requires --notes-file and --github-output'
    )
  })

  test('appends stable machine-readable metadata to GITHUB_OUTPUT', () => {
    const root = temporaryRoot()
    const outputPath = path.join(root, 'github-output')
    writeFileSync(outputPath, 'existing=value\n')

    writeGithubOutput(outputPath, {
      product: 'extension',
      version: '2026.727.3',
      tag: 'extension-v2026.727.3'
    })

    expect(readFileSync(outputPath, 'utf8')).toBe(
      'existing=value\nproduct=extension\nversion=2026.727.3\ntag=extension-v2026.727.3\n'
    )
  })
})
