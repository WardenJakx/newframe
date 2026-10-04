import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'

import { anvilChainId, anvilRpcUrl } from '../core/config.ts'
import { trackTemporaryPath } from '../core/reaper.ts'
import type { HarnessService } from '../core/service.ts'

const sourceProfile =
  process.env.NEWFRAME_DEV_PROFILE ?? path.join(homedir(), 'Library/Application Support/Newframe dev')

type PersistedConfig = {
  zustand?: {
    'canonical-wallet-state'?: {
      state?: {
        main?: {
          networks?: {
            ethereum?: Record<string, { connection?: { primary?: { custom?: string } } }>
          }
        }
      }
    }
  }
}

// The canonical profile's local chain points at the regular development Anvil.
async function pointAnvilChainAtHarness(configPath: string) {
  const config = JSON.parse(await readFile(configPath, 'utf8')) as PersistedConfig
  const primary =
    config.zustand?.['canonical-wallet-state']?.state?.main?.networks?.ethereum?.[anvilChainId]?.connection
      ?.primary
  if (primary) {
    primary.custom = anvilRpcUrl
    await writeFile(configPath, JSON.stringify(config))
  }
}

/** A throwaway copy of the durable development profile, so the harness never touches a live one. */
export class HarnessProfileService implements HarnessService<string> {
  readonly name = 'Newframe harness profile'
  private directory?: string
  private release?: () => void

  async start() {
    const directory = await mkdtemp(path.join(tmpdir(), 'newframe-harness-profile-'))
    this.directory = directory
    this.release = trackTemporaryPath(directory)

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
    return directory
  }

  async stop() {
    if (this.directory) {
      await rm(this.directory, { recursive: true, force: true })
      this.release?.()
    }
  }
}
