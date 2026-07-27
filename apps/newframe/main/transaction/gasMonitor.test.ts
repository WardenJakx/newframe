import { beforeEach, describe, expect, it, mock } from 'bun:test'

import { intToHex } from '@ethereumjs/util'
import GasMonitor from './gasMonitor'

let requestHandlers: any
const testConnection = {
  send: mock((method, params) => {
    if (method in requestHandlers) {
      return Promise.resolve(requestHandlers[method](params))
    }

    return Promise.reject('unsupported method: ' + method)
  })
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

  let gasUsedRatios: any, blockRewards: any

  beforeEach(() => {
    // default to all blocks being ineligible for priority fee calculation
    gasUsedRatios = []
    blockRewards = []

    requestHandlers = {
      eth_feeHistory: mock((params) => {
        const numBlocks = parseInt(params[0] || '0x', 16)

        return {
          // base fees include the requested number of blocks plus the next block
          baseFeePerGas: Array(numBlocks).fill('0x8').concat([nextBlockBaseFee]),
          gasUsedRatio: fillEmptySlots(gasUsedRatios, numBlocks, 0).reverse(),
          oldestBlock: '0x89502f',
          reward: fillEmptySlots(blockRewards, numBlocks, ['0x0']).reverse()
        }
      })
    }
  })

  it('requests the configured sample and returns the complete normalized fee history', async () => {
    const monitor = new GasMonitor(testConnection)
    const feeHistory = await monitor.getFeeHistory(1, [10, 20, 30])

    expect(requestHandlers['eth_feeHistory']).toHaveBeenCalledWith([intToHex(1), 'pending', [10, 20, 30]])
    expect(feeHistory).toHaveLength(2)
    expect(feeHistory[0]).toEqual({ baseFee: 8, gasUsedRatio: 0, rewards: [0] })
    expect(feeHistory[1]).toMatchObject({ baseFee: 182, rewards: [] })
    expect(feeHistory[1].gasUsedRatio).toBeUndefined()
  })
})

// helper functions
function fillEmptySlots(arr: any, targetLength: any, value: any) {
  const target = arr.slice()
  let i = 0

  while (i < targetLength) {
    target[i] = target[i] || value
    i += 1
  }

  return target
}
