import { intToHex } from '@ethereumjs/util'

import type { Block } from '../chains/gas'

interface FeeHistoryResponse {
  baseFeePerGas: string[]
  gasUsedRatio: number[]
  reward: Array<string[]>
  oldestBlock: string
}

interface GasPrices {
  slow: string
  standard: string
  fast: string
  asap: string
}

interface RpcProvider {
  send(method: string, params: any[]): Promise<any>
}

export default class GasMonitor {
  private connection: RpcProvider

  constructor(connection: RpcProvider) {
    this.connection = connection
  }

  async getFeeHistory(
    numBlocks: number,
    rewardPercentiles: number[],
    newestBlock = 'pending'
  ): Promise<Block[]> {
    const blockCount = intToHex(numBlocks)

    const feeHistory: FeeHistoryResponse = await this.connection.send('eth_feeHistory', [
      blockCount,
      newestBlock,
      rewardPercentiles
    ])

    const feeHistoryBlocks = feeHistory.baseFeePerGas.map((baseFee, i) => {
      return {
        baseFee: parseInt(baseFee, 16),
        gasUsedRatio: feeHistory.gasUsedRatio[i],
        rewards: (feeHistory.reward[i] || []).map((reward) => parseInt(reward, 16))
      }
    })

    return feeHistoryBlocks
  }

  async getGasPrices(): Promise<GasPrices> {
    const gasPrice = await this.connection.send('eth_gasPrice', [])

    // in the future we may want to have specific calculators to calculate variations
    // in the gas price or eliminate this structure altogether
    return {
      slow: gasPrice,
      standard: gasPrice,
      fast: gasPrice,
      asap: gasPrice
    }
  }
}
