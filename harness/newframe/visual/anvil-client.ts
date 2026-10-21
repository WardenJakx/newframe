import { anvilRpcUrl } from '../core/config.ts'
import { sleep } from '../core/utils.ts'

export class AnvilClient {
  readonly rpcUrl: string

  constructor(rpcUrl = anvilRpcUrl) {
    this.rpcUrl = rpcUrl
  }

  private async rpc<T>(method: string, params: unknown[]): Promise<T> {
    const response = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 1, jsonrpc: '2.0', method, params })
    })
    const payload = (await response.json()) as { result?: T; error?: { message?: string } }

    if (!response.ok || payload.error) {
      throw new Error(payload.error?.message ?? `Anvil ${method} request failed with ${response.status}`)
    }

    return payload.result as T
  }

  async balance(address: string) {
    return BigInt(await this.rpc<string>('eth_getBalance', [address, 'latest']))
  }

  async mineBlocks(count: number) {
    for (let i = 0; i < count; i += 1) {
      await this.rpc('evm_mine', [])
    }
  }

  async mineBlocksOver(count: number, delayMs: number) {
    for (let i = 0; i < count; i += 1) {
      await sleep(delayMs)
      await this.mineBlocks(1)
    }
  }

  startBackgroundMining(intervalMs: number) {
    const controller = new AbortController()
    const isRunning = () => !controller.signal.aborted
    const promise = (async () => {
      while (isRunning()) {
        await sleep(intervalMs)
        if (isRunning()) {
          await this.mineBlocks(1).catch(() => undefined)
        }
      }
    })()

    return async () => {
      controller.abort()
      await promise
    }
  }

  async waitForBalance(address: string, expected: bigint) {
    const started = Date.now()

    while (Date.now() - started < 45_000) {
      const current = await this.balance(address)
      if (current === expected) {
        return
      }
      await sleep(500)
    }

    const current = await this.balance(address)
    throw new Error(`Expected ${address} balance ${expected}, found ${current}`)
  }
}
