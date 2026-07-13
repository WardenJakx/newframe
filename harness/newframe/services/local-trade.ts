import { appDir, anvilRpcUrl, localTradeServiceHealthUrl, ports } from '../core/config.ts'
import { ProcessService } from '../core/process-service.ts'
import { assertPortFree, waitForHttpOk } from '../core/utils.ts'

type LocalTradeServiceOptions = {
  stdio?: 'inherit' | ['ignore', 'pipe', 'pipe']
}

export function createLocalTradeService(options: LocalTradeServiceOptions = {}) {
  return new ProcessService({
    name: 'local Flash service',
    command: 'bun',
    args: ['./scripts/local-trade-service.ts'],
    spawn: {
      cwd: appDir,
      env: {
        ...process.env,
        ANVIL_RPC_URL: anvilRpcUrl,
        FLASH_LOCAL_TRADE_PORT: String(ports.localTrade)
      },
      stdio: options.stdio || ['ignore', 'pipe', 'pipe']
    },
    beforeStart: () => assertPortFree(ports.localTrade, 'Local Flash service'),
    ready: () => waitForHttpOk(localTradeServiceHealthUrl, 'local Flash service')
  })
}
