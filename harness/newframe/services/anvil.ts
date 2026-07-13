import {
  anvilBlockTimeSeconds,
  anvilChainId,
  anvilHost,
  anvilRpcUrl,
  contractsDir,
  ports
} from '../core/config.ts'
import { ProcessService } from '../core/process-service.ts'
import { assertPortFree, sleep } from '../core/utils.ts'

type AnvilServiceOptions = {
  stdio?: 'inherit' | ['ignore', 'pipe', 'pipe']
}

export function anvilArgs() {
  return [
    '--host',
    anvilHost,
    '--port',
    String(ports.anvil),
    '--chain-id',
    String(anvilChainId),
    '--block-time',
    String(anvilBlockTimeSeconds)
  ]
}

export function assertAnvilSpawnConfig() {
  const url = new URL(anvilRpcUrl)
  const rpcPort = Number(url.port || (url.protocol === 'https:' || url.protocol === 'wss:' ? 443 : 80))

  if (rpcPort !== ports.anvil) {
    throw new Error(`Anvil RPC URL ${anvilRpcUrl} does not match the configured spawn port ${ports.anvil}`)
  }
}

export async function waitForAnvil(timeoutMs = 15_000) {
  const started = Date.now()
  let lastError: unknown

  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(anvilRpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: 1, jsonrpc: '2.0', method: 'eth_chainId', params: [] })
      })
      const payload = (await response.json()) as { error?: { message?: string }; result?: string }

      if (!response.ok || payload.error) {
        throw new Error(payload.error?.message || `HTTP ${response.status}`)
      }

      const chainId = Number(payload.result)
      if (chainId === anvilChainId) return

      lastError = new Error(`expected chain ID ${anvilChainId}, found ${payload.result || 'none'}`)
    } catch (err) {
      lastError = err
    }

    await sleep(250)
  }

  throw new Error(
    `Timed out waiting for Anvil at ${anvilRpcUrl}${lastError instanceof Error ? `: ${lastError.message}` : ''}`
  )
}

export function createAnvilService(options: AnvilServiceOptions = {}) {
  return new ProcessService({
    name: 'anvil',
    command: 'anvil',
    args: anvilArgs(),
    spawn: {
      cwd: contractsDir,
      env: process.env,
      stdio: options.stdio || ['ignore', 'pipe', 'pipe']
    },
    beforeStart: async () => {
      assertAnvilSpawnConfig()
      await assertPortFree(ports.anvil, 'Anvil')
    },
    ready: () => waitForAnvil()
  })
}
