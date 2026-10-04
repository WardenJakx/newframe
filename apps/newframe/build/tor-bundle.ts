import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { Arch, type AfterPackContext } from 'electron-builder'

const run = promisify(execFile)

export function torEnabledByDefault(value = process.env.NEWFRAME_TOR_ENABLED): boolean {
  if (value === 'true' || value === '1') {
    return true
  }
  if (value === undefined || value === 'false' || value === '0') {
    return false
  }
  throw new Error('NEWFRAME_TOR_ENABLED must be true, false, 1, or 0')
}

// SHA256 values from the Tor Project's sha256sums-signed-build.txt manifests:
// https://dist.torproject.org/torbrowser/15.0.24/sha256sums-signed-build.txt
// https://dist.torproject.org/torbrowser/16.0a13/sha256sums-signed-build.txt
// Linux arm64 is only distributed in the alpha expert-bundle channel. Both
// bundles ship the same stable Tor daemon, 0.4.9.13. No alpha daemon is used.
const bundles: Partial<
  Record<string, { platform: string; architecture: string; version: string; sha256: string }>
> = {
  'darwin-arm64': {
    platform: 'macos',
    architecture: 'aarch64',
    version: '15.0.24',
    sha256: 'd47afd04b6c751129978390ad003d74ac8b88adfbb939350f0f89999e6570644'
  },
  'darwin-x64': {
    platform: 'macos',
    architecture: 'x86_64',
    version: '15.0.24',
    sha256: '8acb0b590f6be34084dcb6d84009ac0c61cc7c5261b7a19d2ab94845aa9bd5b6'
  },
  'linux-arm64': {
    platform: 'linux',
    architecture: 'aarch64',
    version: '16.0a13',
    sha256: 'e1685ff7a531e7b50b77ce231e8be397c835dd2dcb96b2fd8feb02c638acc517'
  },
  'linux-x64': {
    platform: 'linux',
    architecture: 'x86_64',
    version: '15.0.24',
    sha256: '8e012ec6815d7899cb64011582e2dade88e74119c6661068a2a3252de0ccd7f2'
  },
  'win32-ia32': {
    platform: 'windows',
    architecture: 'i686',
    version: '15.0.24',
    sha256: '7c2755b09876ebc6c2e2d2d1d3279b2be3e9beec35ff0ca2e7df4c1abcad1ae4'
  },
  'win32-x64': {
    platform: 'windows',
    architecture: 'x86_64',
    version: '15.0.24',
    sha256: 'e9dc6ccc93cd6afa507193f4de284d6424233ff5102155cd2c94b259e8a22b65'
  }
}

export function torBundleDirectory(context: AfterPackContext): string {
  // electron-builder's ${os} follows the package target; ${platform} uses the host.
  const targetOs = { darwin: 'mac', win32: 'win', linux: 'linux' }[context.electronPlatformName]
  return join(context.packager.projectDir, 'build', 'tor', `${targetOs}-${Arch[context.arch]}`)
}

async function signMacBinaries(directory: string) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = join(directory, entry.name)
    if (entry.isDirectory()) {
      await signMacBinaries(target)
    } else if (entry.isFile()) {
      const bytes = await readFile(target)
      if (bytes.length < 4) {
        continue
      }
      const magic = bytes.readUInt32BE(0)
      if ([0xcffaedfe, 0xfeedfacf, 0xcafebabe].includes(magic)) {
        // Expert bundles are unsigned. Apple Silicon requires at least an ad hoc
        // signature; electron-builder replaces it when signing the release app.
        await run('codesign', ['--force', '--sign', '-', target])
      }
    }
  }
}

export async function prepareTorBundle(context: AfterPackContext) {
  const enabledByDefault = torEnabledByDefault()
  const architecture = Arch[context.arch]
  const bundle = bundles[`${context.electronPlatformName}-${architecture}`]
  if (!bundle) {
    throw new Error(`No verified Tor bundle for ${context.electronPlatformName}-${architecture}`)
  }
  const cache = join(context.packager.projectDir, 'build', 'tor')
  await mkdir(cache, { recursive: true })
  const filename = `tor-expert-bundle-${bundle.platform}-${bundle.architecture}-${bundle.version}.tar.gz`
  const archive = join(cache, filename)
  let bytes = await readFile(archive).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
    return undefined
  })
  if (bytes === undefined) {
    const response = await fetch(`https://dist.torproject.org/torbrowser/${bundle.version}/${filename}`, {
      signal: AbortSignal.timeout(120_000)
    })
    if (!response.ok) {
      throw new Error(`Tor bundle download failed (${response.status})`)
    }
    bytes = Buffer.from(await response.arrayBuffer())
  }
  if (createHash('sha256').update(bytes).digest('hex') !== bundle.sha256) {
    throw new Error(`Tor bundle checksum mismatch for ${filename}`)
  }
  await writeFile(archive, bytes)
  const destination = torBundleDirectory(context)
  const staging = `${destination}.staging`
  await rm(staging, { recursive: true, force: true })
  await mkdir(staging, { recursive: true })
  try {
    await run('tar', ['-xzf', archive, '-C', staging])
    // Browser transport plugins are unused; retain the Tor binary, libraries,
    // geoip data, and license documents from the verified official archive.
    await rm(join(staging, 'tor', 'pluggable_transports'), { recursive: true, force: true })
    await rm(join(staging, 'debug'), { recursive: true, force: true })
    await rm(join(staging, 'data', 'torrc-defaults'), { force: true })
    if (context.electronPlatformName === 'darwin') {
      await signMacBinaries(join(staging, 'tor'))
    }
    await rm(destination, { recursive: true, force: true })
    await rename(staging, destination)
    const compiled = join(context.packager.projectDir, 'compiled')
    await mkdir(compiled, { recursive: true })
    await writeFile(join(compiled, 'tor-config.json'), JSON.stringify({ enabledByDefault }) + '\n')
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}
