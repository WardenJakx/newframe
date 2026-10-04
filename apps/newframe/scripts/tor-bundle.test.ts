import { afterEach, expect, it } from 'bun:test'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  Arch,
  LinuxPackager,
  MacPackager,
  Platform,
  WinPackager,
  type AfterPackContext
} from 'electron-builder'

import config from '../build/electron-builder-base.ts'
import { prepareTorBundle, torBundleDirectory, torEnabledByDefault } from '../build/tor-bundle.ts'

const directories: string[] = []

it('validates the build-time Tor default without silently disabling Tor on a typo', () => {
  for (const value of ['true', '1']) {
    expect(torEnabledByDefault(value)).toBe(true)
  }
  for (const value of [undefined, 'false', '0']) {
    expect(torEnabledByDefault(value)).toBe(false)
  }
  expect(() => torEnabledByDefault('flase')).toThrow('NEWFRAME_TOR_ENABLED')
})

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

it.each([
  [Platform.MAC, Arch.arm64, MacPackager.prototype, 'mac-arm64'],
  [Platform.MAC, Arch.x64, MacPackager.prototype, 'mac-x64'],
  [Platform.WINDOWS, Arch.x64, WinPackager.prototype, 'win-x64'],
  [Platform.WINDOWS, Arch.ia32, WinPackager.prototype, 'win-ia32'],
  [Platform.LINUX, Arch.arm64, LinuxPackager.prototype, 'linux-arm64'],
  [Platform.LINUX, Arch.x64, LinuxPackager.prototype, 'linux-x64']
] as const)('selects the Tor resources for package target %s', (platform, arch, prototype, directory) => {
  const context = {
    electronPlatformName: platform.nodeName,
    arch,
    packager: { projectDir: '/project', platform, appInfo: {} }
  } as AfterPackContext
  const resourcePath = prototype.expandMacro.call(context.packager, config.extraResources[0].from, Arch[arch])
  expect(torBundleDirectory(context)).toBe(join('/project', 'build', 'tor', directory))
  expect(torBundleDirectory(context)).toBe(join('/project', resourcePath))
})

it('rejects unsupported package targets rather than packaging without Tor', async () => {
  const context = { electronPlatformName: 'win32', arch: Arch.arm64 } as AfterPackContext
  expect(await prepareTorBundle(context).catch((error: unknown) => error)).toEqual(
    new Error('No verified Tor bundle for win32-arm64')
  )
})

it('rejects cached archives whose bytes do not match the pinned official checksum', async () => {
  const projectDir = await mkdtemp(join(tmpdir(), 'newframe-tor-bundle-test-'))
  directories.push(projectDir)
  const cache = join(projectDir, 'build', 'tor')
  await mkdir(cache, { recursive: true })
  await writeFile(join(cache, 'tor-expert-bundle-macos-aarch64-15.0.24.tar.gz'), 'altered bundle')
  const context = {
    electronPlatformName: 'darwin',
    arch: Arch.arm64,
    packager: { projectDir }
  } as AfterPackContext
  expect(await prepareTorBundle(context).catch((error: unknown) => error)).toEqual(
    new Error('Tor bundle checksum mismatch for tor-expert-bundle-macos-aarch64-15.0.24.tar.gz')
  )
})
