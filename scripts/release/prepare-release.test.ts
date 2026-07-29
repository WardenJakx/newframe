import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  nextCalVer,
  parseCliOptions,
  prepareRelease,
  releaseTagsFromRemoteOutput,
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
    const result = prepareRelease(root, 'desktop', new Date('2026-07-27T12:00:00Z'), [])

    expect(result).toEqual({
      product: 'desktop',
      version: '2026.727.1',
      tag: 'desktop-v2026.727.1'
    })
    expect(JSON.parse(readFileSync(path.join(root, 'apps/newframe/package.json'), 'utf8')).version).toBe(
      '2026.727.1'
    )
    expect(readFileSync(path.join(root, 'apps/newframe-extension/package.json'), 'utf8')).toBe(
      extensionBefore
    )
    expect(
      readFileSync(path.join(root, 'apps/newframe-extension/src/manifest.json'), 'utf8')
    ).toBe(extensionManifestBefore)
  })

  test('keeps extension package and manifest versions synchronized', () => {
    const root = temporaryRoot()
    seedProduct(root, 'desktop')
    seedProduct(root, 'extension')
    const desktopPackageBefore = readFileSync(path.join(root, 'apps/newframe/package.json'), 'utf8')
    prepareRelease(
      root,
      'extension',
      new Date('2026-07-27T12:00:00Z'),
      ['extension-v2026.727.4']
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
  })

  test('is byte-for-byte safe to rerun when tags have not changed', () => {
    const root = temporaryRoot()
    seedProduct(root, 'extension')
    const date = new Date('2026-07-27T12:00:00Z')

    prepareRelease(root, 'extension', date, [])
    const paths = [
      path.join(root, 'apps/newframe-extension/package.json'),
      path.join(root, 'apps/newframe-extension/src/manifest.json')
    ]
    const firstRun = paths.map((file) => readFileSync(file, 'utf8'))

    prepareRelease(root, 'extension', date, [])

    expect(paths.map((file) => readFileSync(file, 'utf8'))).toEqual(firstRun)
  })
})

describe('workflow interface', () => {
  test('requires the GitHub output path', () => {
    expect(parseCliOptions(['desktop', '--github-output', '/tmp/github-output'])).toEqual({
      product: 'desktop',
      githubOutput: '/tmp/github-output'
    })
    expect(() => parseCliOptions(['desktop'])).toThrow('requires --github-output')
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
