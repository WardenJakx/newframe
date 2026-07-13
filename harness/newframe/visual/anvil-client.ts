import { anvilRpcUrl } from '../core/config.ts'
import { sleep } from '../core/utils.ts'

export class AnvilClient {
  readonly rpcUrl: string

  constructor(rpcUrl = anvilRpcUrl) {
    this.rpcUrl = rpcUrl
  }

  async balance(address: string) {
    const response = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 1,
        jsonrpc: '2.0',
        method: 'eth_getBalance',
        params: [address, 'latest']
      })
    })
    const payload = (await response.json()) as { result?: string; error?: { message?: string } }

    if (!response.ok || payload.error || !payload.result) {
      throw new Error(payload.error?.message || `Anvil balance request failed with ${response.status}`)
    }

    return BigInt(payload.result)
  }

  async mineBlocks(count: number) {
    for (let i = 0; i < count; i += 1) {
      const response = await fetch(this.rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: i + 1, jsonrpc: '2.0', method: 'evm_mine', params: [] })
      })
      const payload = (await response.json()) as { error?: { message?: string } }

      if (!response.ok || payload.error) {
        throw new Error(payload.error?.message || `Anvil mine request failed with ${response.status}`)
      }
    }
  }

  async mineBlocksOver(count: number, delayMs: number) {
    for (let i = 0; i < count; i += 1) {
      await sleep(delayMs)
      await this.mineBlocks(1)
    }
  }

  startBackgroundMining(intervalMs: number) {
    let stopped = false
    const promise = (async () => {
      while (!stopped) {
        await sleep(intervalMs)
        if (!stopped) await this.mineBlocks(1).catch(() => undefined)
      }
    })()

    return async () => {
      stopped = true
      await promise
    }
  }

  async waitForBalance(address: string, expected: bigint) {
    const started = Date.now()

    while (Date.now() - started < 45_000) {
      const current = await this.balance(address)
      if (current === expected) return
      await sleep(500)
    }

    const current = await this.balance(address)
    throw new Error(`Expected ${address} balance ${expected}, found ${current}`)
  }
}
