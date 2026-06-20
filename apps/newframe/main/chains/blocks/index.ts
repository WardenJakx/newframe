import { EventEmitter } from 'events'
import { addHexPrefix } from '@ethereumjs/util'
import log from 'electron-log'

interface RpcProvider {
  send(method: string, params: any[]): Promise<any>
  on(event: string, listener: (...args: any[]) => void): unknown
  off(event: string, listener: (...args: any[]) => void): unknown
}

interface Block {
  number: string
  hash: string | null
  parentHash: string
  nonce: string | null
  sha3Uncles: string
  logsBloom: string | null
  transactionsRoot: string
  stateRoot: string
  miner: string
  difficulty: string
  totalDifficulty: string
  extraData: string
  size: number
  gasLimit: number
  gasUsed: number
  timestamp: number
  uncles: string[]
}

class BlockMonitor extends EventEmitter {
  private provider: RpcProvider
  private chainIdValue: string
  private started = false

  latestBlock: string

  constructor(provider: RpcProvider, chainId: string) {
    super()

    this.start = this.start.bind(this)
    this.stop = this.stop.bind(this)
    this.handleBlockNumber = this.handleBlockNumber.bind(this)
    this.handleBlock = this.handleBlock.bind(this)
    this.getLatestBlock = this.getLatestBlock.bind(this)

    this.provider = provider
    this.chainIdValue = chainId

    this.latestBlock = '0x0'
  }

  start() {
    if (this.started) return
    this.started = true

    log.verbose(`%cStarting block updates for chain ${this.chainId}`, 'color: green')

    this.provider.on('block', this.handleBlockNumber)

    // load the latest block first on connect, then start checking for new blocks
    this.getLatestBlock()
  }

  stop() {
    if (!this.started) return
    this.started = false

    log.verbose(`%cStopping block updates for chain ${this.chainId}`, 'color: red')

    this.provider.off('block', this.handleBlockNumber)
  }

  get chainId() {
    return this.chainIdValue.startsWith('0x') ? parseInt(this.chainIdValue, 16) : parseInt(this.chainIdValue)
  }

  private getLatestBlock() {
    this.getBlock('latest')
  }

  private handleBlockNumber(blockNumber: number) {
    this.getBlock(addHexPrefix(blockNumber.toString(16)))
  }

  private getBlock(blockTag: string) {
    this.provider
      .send('eth_getBlockByNumber', [blockTag, false])
      .then((block) => this.handleBlock(block))
      .catch((err) => this.handleError(`Could not load block for chain ${this.chainId}`, err))
  }

  private handleBlock(blockUpdate: unknown) {
    if (!blockUpdate || typeof blockUpdate !== 'object') {
      return this.handleError(`Received invalid block on chain ${this.chainId}`)
    }

    const block = blockUpdate as Block

    log.debug(`%cReceived block ${parseInt(block.number)} for chain ${this.chainId}`, 'color: yellow', {
      latestBlock: parseInt(this.latestBlock)
    })

    if (block.number !== this.latestBlock) {
      this.latestBlock = block.number
      this.emit('status', 'connected')
      this.emit('data', block)
    }
  }

  private handleError(...args: any) {
    this.emit('status', 'degraded')
    log.error(...args)
  }
}

export default BlockMonitor
