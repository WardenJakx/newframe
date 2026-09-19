import { beforeEach, describe, expect, it, mock } from 'bun:test'

import { intToHex } from '@ethereumjs/util'

import GasMonitor from './gasMonitor'

let requestHandlers: Record<string, (params: readonly unknown[]) => unknown>
const testConnection = {
  async send<T>(method: string, params: readonly unknown[]): Promise<T> {
    if (method in requestHandlers) {
      return Promise.resolve(requestHandlers[method](params)) as Promise<T>
    }

    throw new Error('unsupported method: ' + method)
  }
}

describe('#getGasPrices', () => {
  const gasPrice = '0x3baa1028'

  beforeEach(() => {
    requestHandlers = {
      eth_gasPrice: () => gasPrice
    }
  })

  it('projects the node gas price into every urgency level', async () => {
    const monitor = new GasMonitor(testConnection)

    const gas = await monitor.getGasPrices()

    expect(gas).toEqual({
      slow: gasPrice,
      standard: gasPrice,
      fast: gasPrice,
      asap: gasPrice
    })
  })
})

describe('#getFeeHistory', () => {
  const nextBlockBaseFee = '0xb6'

  let gasUsedRatios: number[]
  let blockRewards: string[][]
  let feeHistoryHandler: ReturnType<typeof mock>

  beforeEach(() => {
    // default to all blocks being ineligible for priority fee calculation
    gasUsedRatios = []
    blockRewards = []

    requestHandlers = {
      eth_feeHistory: (feeHistoryHandler = mock((params: readonly unknown[]) => {
        const blockCount = params[0]
        const numBlocks = typeof blockCount === 'string' ? parseInt(blockCount, 16) : 0

        return {
          // base fees include the requested number of blocks plus the next block
          baseFeePerGas: Array(numBlocks).fill('0x8').concat([nextBlockBaseFee]),
          gasUsedRatio: fillEmptySlots(gasUsedRatios, numBlocks, 0).reverse(),
          oldestBlock: '0x89502f',
          reward: fillEmptySlots(blockRewards, numBlocks, ['0x0']).reverse()
        }
      }))
    }
  })

  it('requests the configured sample and returns the complete normalized fee history', async () => {
    const monitor = new GasMonitor(testConnection)
    const feeHistory = await monitor.getFeeHistory(1, [10, 20, 30])

    expect(feeHistoryHandler).toHaveBeenCalledWith([intToHex(1), 'pending', [10, 20, 30]])
    expect(feeHistory).toHaveLength(2)
    expect(feeHistory[0]).toEqual({ baseFee: 8, gasUsedRatio: 0, rewards: [0] })
    expect(feeHistory[1]).toMatchObject({ baseFee: 182, rewards: [] })
    expect(feeHistory[1].gasUsedRatio).toBeUndefined()
  })
})

// helper functions
function fillEmptySlots<T>(arr: T[], targetLength: number, value: T) {
  const target = arr.slice()
  let i = 0

  while (i < targetLength) {
    target[i] = target[i] ?? value
    i += 1
  }

  return target
}
