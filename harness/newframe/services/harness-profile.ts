import { createCipheriv, createHash, randomBytes, scryptSync } from 'node:crypto'
import { existsSync } from 'node:fs'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'

import { anvilChainId, anvilRpcUrl, readHarnessPassword } from '../core/config.ts'
import { trackTemporaryPath } from '../core/reaper.ts'
import type { HarnessService } from '../core/service.ts'

// Electron's `app.getPath('appData')` on each platform.
function appDataDirectory() {
  if (process.platform === 'darwin') {
    return path.join(homedir(), 'Library/Application Support')
  }
  if (process.platform === 'win32') {
    return process.env.APPDATA ?? path.join(homedir(), 'AppData/Roaming')
  }
  return process.env.XDG_CONFIG_HOME ?? path.join(homedir(), '.config')
}

const sourceProfile = process.env.NEWFRAME_DEV_PROFILE ?? path.join(appDataDirectory(), 'Newframe dev')

/**
 * Whether runs start from the developer's profile rather than a fresh one the harness seeds itself. A profile
 * without a vault has no password to unlock it with.
 */
export const hasSourceProfile = existsSync(path.join(sourceProfile, 'vault.json'))

type StoredChains = {
  ethereum?: Record<string, { connection?: { primary?: { custom?: string } } }>
}

type PersistedConfig = {
  zustand?: {
    'canonical-wallet-state'?: {
      state?: {
        // Before v8, chains were stored under `networks`.
        main?: Partial<Record<'chains' | 'networks', StoredChains>>
      }
    }
  }
}

// The canonical profile's local chain points at the regular development Anvil.
async function pointAnvilChainAtHarness(configPath: string) {
  const config = JSON.parse(await readFile(configPath, 'utf8')) as PersistedConfig
  const main = config.zustand?.['canonical-wallet-state']?.state?.main
  const primary = (main?.chains ?? main?.networks)?.ethereum?.[anvilChainId]?.connection?.primary
  if (primary) {
    primary.custom = anvilRpcUrl
    await writeFile(configPath, JSON.stringify(config))
  }
}

async function copySourceProfile(directory: string) {
  for (const file of ['config.json', 'vault.json']) {
    await cp(path.join(sourceProfile, file), path.join(directory, file))
  }
  await cp(path.join(sourceProfile, 'signers'), path.join(directory, 'signers'), { recursive: true }).catch(
    (error: unknown) => {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    }
  )
  await pointAnvilChainAtHarness(path.join(directory, 'config.json'))
}

// Mirrors `Vault.write` in apps/newframe/src/platform/secrets/vault.ts; the unlock stage fails if they drift.
function encodeVault(password: string) {
  const kdf = { N: 32768, r: 8, p: 1 }
  const vaultKey = randomBytes(32)
  const salt = randomBytes(16)
  const iv = randomBytes(16)
  const cipher = createCipheriv(
    'aes-256-cbc',
    scryptSync(password, salt, 32, { ...kdf, maxmem: 36000000 }),
    iv
  )
  return {
    version: 1,
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    encryptedKey: Buffer.concat([cipher.update(vaultKey), cipher.final()]).toString('hex'),
    keyHash: createHash('sha256').update(vaultKey).digest('hex'),
    kdf
  }
}

// A fresh profile holds only a vault for the harness password; stages add the accounts they need.
async function seedFreshProfile(directory: string) {
  const vault = encodeVault(readHarnessPassword())
  await writeFile(path.join(directory, 'vault.json'), JSON.stringify(vault), { mode: 0o600 })
}

/**
 * A throwaway copy of the durable development profile, so the harness never touches a live one. Without a
 * development profile (a fresh machine), the harness seeds a new one instead.
 */
export class HarnessProfileService implements HarnessService<string> {
  readonly name = 'Newframe harness profile'
  private directory?: string
  private release?: () => void

  async start() {
    const directory = await mkdtemp(path.join(tmpdir(), 'newframe-harness-profile-'))
    this.directory = directory
    this.release = trackTemporaryPath(directory)

    await (hasSourceProfile ? copySourceProfile(directory) : seedFreshProfile(directory))
    return directory
  }

  async stop() {
    if (this.directory) {
      await rm(this.directory, { recursive: true, force: true })
      this.release?.()
    }
  }
}
