import { anvilChainId, anvilRpcUrl, contractsDir, ports } from '../core/config.ts'
import { ProcessService } from '../core/process-service.ts'
import { assertPortFree, sleep } from '../core/utils.ts'

async function waitForAnvil(timeoutMs = 15_000) {
  const started = Date.now()
  let lastError: unknown

  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(anvilRpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: 1, jsonrpc: '2.0', method: 'web3_clientVersion', params: [] })
      })
      if (response.ok) return
    } catch (err) {
      lastError = err
    }

    await sleep(250)
  }

  throw new Error(
    `Timed out waiting for Anvil at ${anvilRpcUrl}${lastError instanceof Error ? `: ${lastError.message}` : ''}`
  )
}

export function createAnvilService() {
  return new ProcessService({
    name: 'anvil',
    command: 'anvil',
    args: ['--host', '127.0.0.1', '--port', String(ports.anvil), '--chain-id', String(anvilChainId)],
    spawn: {
      cwd: contractsDir,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    },
    beforeStart: () => assertPortFree(ports.anvil, 'Anvil'),
    ready: () => waitForAnvil()
  })
}
