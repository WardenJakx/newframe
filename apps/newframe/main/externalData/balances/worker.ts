import log from 'electron-log'
import createProvider from '../../provider/connection'

log.transports.console.format = '[scanWorker] {h}:{i}:{s}.{ms} {text}'
log.transports.console.level = process.env.LOG_WORKER ? 'debug' : 'info'
log.transports.file.level = ['development', 'test'].includes(process.env.NODE_ENV || 'development')
  ? false
  : 'verbose'

import balancesLoader, { BalanceLoader } from './scan'

import type { Token } from '../../store/state'

interface ExternalDataWorkerMessage {
  command: string
  args: any[]
}

let heartbeat: NodeJS.Timeout
let balances: BalanceLoader

const eth = createProvider('http://127.0.0.1:1248', { origin: 'newframe-internal', name: 'scanWorker' })

eth.on('connect', async () => {
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

function sendToMainProcess(data: any) {
  if (process.send) {
    return process.send(data)
  } else {
    log.error(`cannot send to main process! connected: ${process.connected}`)
  }
}

async function fetchTokenBalances(address: Address, tokens: Token[]) {
  try {
    const tokenBalances = await balances.getTokenBalances(address, tokens)

    sendToMainProcess({ type: 'tokenBalances', address, balances: tokenBalances })
  } catch (e) {
    log.error('error fetching token balances', e)
  }
}

async function chainBalanceScan(address: string, chains?: number[]) {
  try {
    const availableChains = chains || (await getChains())
    const chainBalances = await balances.getCurrencyBalances(address, availableChains)

    sendToMainProcess({ type: 'chainBalances', balances: chainBalances, address })
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

const messageHandler: { [command: string]: (...params: any) => void } = {
  updateChainBalance: chainBalanceScan,
  fetchTokenBalances: fetchTokenBalances,
  heartbeat: resetHeartbeat
}

process.on('message', (message: ExternalDataWorkerMessage) => {
  log.debug(`received message: ${message.command} [${message.args}]`)

  const args = message.args || []
  messageHandler[message.command](...args)
})
