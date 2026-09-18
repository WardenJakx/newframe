import { appDir, localSafeServiceUrl, ports } from '../core/config.ts'
import { ProcessService } from '../core/process-service.ts'
import { assertPortFree, waitForHttpOk } from '../core/utils.ts'
import type { SafeSeedManifest } from './safe-contracts.ts'

export function createLocalSafeService(
  seed: SafeSeedManifest,
  options: { stdio?: 'inherit' | ['ignore', 'pipe', 'pipe'] } = {}
) {
  return new ProcessService({
    name: 'local Safe service',
    command: 'bun',
    args: ['./scripts/local-safe-service.ts'],
    spawn: {
      cwd: appDir,
      env: {
        ...process.env,
        NEWFRAME_SAFE_SEED: JSON.stringify({ ...seed, includeMismatch: true }),
        NEWFRAME_LOCAL_SAFE_PORT: String(ports.localSafe)
      },
      stdio: options.stdio ?? ['ignore', 'pipe', 'pipe']
    },
    beforeStart: () => assertPortFree(ports.localSafe, 'Local Safe service'),
    ready: () => waitForHttpOk(`${localSafeServiceUrl}/health`, 'local Safe service')
  })
}
