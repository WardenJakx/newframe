import log from 'electron-log'

import createProvider from '../../../../connections/main/provider/connection.js'

log.transports.console.format = '[scanWorker] {h}:{i}:{s}.{ms} {text}'
log.transports.console.level = process.env.LOG_WORKER ? 'debug' : 'info'
log.transports.file.level = ['development', 'test'].includes(process.env.NODE_ENV || 'development')
  ? false
  : 'verbose'

import type { BalanceLoader, TokenDefinition } from './scan.js'
import balancesLoader from './scan.js'

type ExternalDataWorkerMessage =
  | { command: 'updateChainBalance'; args: [string, number[]?] }
  | { command: 'fetchTokenBalances'; args: [Address, TokenDefinition[]] }
  | { command: 'heartbeat'; args: [] }

let heartbeat: NodeJS.Timeout
let balances: BalanceLoader

const eth = createProvider('http://127.0.0.1:1248', {
  origin: 'newframe-internal',
  name: 'scanWorker'
})

eth.on('connect', () => {
  balances = balancesLoader(eth)

  sendToMainProcess({ type: 'ready' })
})

async function getChains() {
  try {
    const chains: string[] = await eth.request({ method: 'wallet_getChains' })
    return chains.map((chain) => parseInt(chain))
  } catch (e) {
    log.error('could not load chains', e)
    return []
  }
}

function sendToMainProcess(data: unknown) {
  if (process.send) {
    return process.send(data)
  }
  log.error(`cannot send to main process! connected: ${process.connected}`)
}

async function fetchTokenBalances(address: Address, tokens: TokenDefinition[]) {
  try {
    const tokenBalances = await balances.getTokenBalances(address, tokens)

    sendToMainProcess({
      type: 'tokenBalances',
      address,
      balances: tokenBalances
    })
  } catch (e) {
    log.error('error fetching token balances', e)
  }
}

async function chainBalanceScan(address: string, chains?: number[]) {
  try {
    const availableChains = chains ?? (await getChains())
    const chainBalances = await balances.getCurrencyBalances(address, availableChains)

    sendToMainProcess({
      type: 'chainBalances',
      balances: chainBalances,
      address
    })
  } catch (e) {
    log.error('error scanning chain balance', e)
  }
}

function disconnect() {
  process.disconnect()
  process.kill(process.pid, 'SIGHUP')
}

function resetHeartbeat() {
  clearTimeout(heartbeat)

  heartbeat = setTimeout(() => {
    log.warn('no heartbeat received in 60 seconds, worker exiting')
    disconnect()
  }, 60 * 1000)
}

function isTokenDefinition(value: unknown): value is TokenDefinition {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    'address' in value &&
    typeof value.address === 'string' &&
    'chainId' in value &&
    typeof value.chainId === 'number' &&
    'decimals' in value &&
    typeof value.decimals === 'number' &&
    'name' in value &&
    typeof value.name === 'string' &&
    'symbol' in value &&
    typeof value.symbol === 'string'
  )
}

function parseWorkerMessage(value: unknown): ExternalDataWorkerMessage | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !('command' in value)) {
    return
  }
  const args = 'args' in value && Array.isArray(value.args) ? value.args : []
  if (
    value.command === 'updateChainBalance' &&
    typeof args[0] === 'string' &&
    (args[1] === undefined || (Array.isArray(args[1]) && args[1].every((chain) => typeof chain === 'number')))
  ) {
    return { command: value.command, args: [args[0], args[1]] }
  }
  if (
    value.command === 'fetchTokenBalances' &&
    typeof args[0] === 'string' &&
    Array.isArray(args[1]) &&
    args[1].every(isTokenDefinition)
  ) {
    return { command: value.command, args: [args[0], args[1]] }
  }
  if (value.command === 'heartbeat' && args.length === 0) {
    return { command: value.command, args: [] }
  }
}

process.on('message', (value: unknown) => {
  const message = parseWorkerMessage(value)
  if (!message) {
    log.warn('received invalid worker message')
    return
  }
  log.debug(`received message: ${message.command} [${message.args}]`)

  if (message.command === 'updateChainBalance') {
    void chainBalanceScan(...message.args)
  } else if (message.command === 'fetchTokenBalances') {
    void fetchTokenBalances(...message.args)
  } else {
    resetHeartbeat()
  }
})
