import log from 'electron-log'
import EventEmitter from 'events'
import { addHexPrefix, intToHex } from '@ethereumjs/util'

import store from '../../../main/store'
import { gweiToHex } from '../../util'

log.transports.console.level = false

class MockConnection extends EventEmitter {
  constructor(chainId: any) {
    super()
    ;(this as any).chainId = addHexPrefix(chainId.toString(16))
    ;(this as any).connected = false
    ;(this as any).connect = () => {
      if (!(this as any).connected) {
        ;(this as any).connected = true
        process.nextTick(() => this.emit('connect'))
      }
    }
    ;(this as any).close = () => {
      if ((this as any).connected) {
        ;(this as any).connected = false
        this.emit('close')
      }
    }
    ;(this as any).destroy = (this as any).close
    ;(this as any).send = (methodOrPayload: any, _params?: any) => {
      return new Promise((resolve, reject) => {
        const method = typeof methodOrPayload === 'string' ? methodOrPayload : methodOrPayload.method

        if (method === 'eth_chainId') {
          ;(this as any).connected = true
          return resolve(addHexPrefix(chainId.toString(16)))
        } else if (method === 'eth_gasPrice') {
          return resolve(gasPrice)
        } else if (method === 'eth_feeHistory') {
          if (feeHistoryError) return reject(feeHistoryError)

          return resolve({
            baseFeePerGas: [gweiToHex(15), gweiToHex(8), gweiToHex(9), gweiToHex(8), gweiToHex(7)],
            gasUsedRatio: [0.11, 0.8, 0.2, 0.5],
            reward: [[gweiToHex(32)], [gweiToHex(32)], [gweiToHex(32)], [gweiToHex(32)]]
          })
        }

        return reject('unknown method!')
      })
    }
  }
}

let feeHistoryError: Error | undefined, gasPrice: any, connectionObserver: any

const state = {
  main: {
    currentNetwork: {
      type: 'ethereum',
      id: '11155111'
    },
    networks: {
      ethereum: {
        11155111: {
          id: 11155111,
          type: 'ethereum',
          name: 'Sepolia',
          connection: {
            primary: {
              on: false,
              current: 'chainlist',
              status: 'loading',
              connected: false,
              type: '',
              network: '',
              custom: ''
            },
            secondary: {
              on: false,
              current: 'custom',
              status: 'loading',
              connected: false,
              type: '',
              network: '',
              custom: ''
            }
          },
          on: true
        },
        137: {
          id: 137,
          type: 'ethereum',
          name: 'Polygon',
          connection: {
            primary: {
              on: false,
              current: 'chainlist',
              status: 'loading',
              connected: false,
              type: '',
              network: '',
              custom: ''
            },
            secondary: {
              on: false,
              current: 'custom',
              status: 'loading',
              connected: false,
              type: '',
              network: '',
              custom: ''
            }
          },
          on: true
        },
        42161: {
          id: 42161,
          type: 'ethereum',
          name: 'Arbitrum',
          connection: {
            primary: {
              on: false,
              current: 'chainlist',
              status: 'loading',
              connected: false,
              type: '',
              network: '',
              custom: ''
            },
            secondary: {
              on: false,
              current: 'custom',
              status: 'loading',
              connected: false,
              type: '',
              network: '',
              custom: ''
            }
          },
          on: true
        }
      }
    },
    networksMeta: {
      ethereum: {
        11155111: {
          gas: {
            price: {
              selected: 'standard',
              levels: { slow: '', standard: '', fast: '', asap: '', custom: '' }
            }
          }
        },
        137: {
          gas: {
            price: {
              selected: 'standard',
              levels: { slow: '', standard: '', fast: '', asap: '', custom: '' }
            }
          }
        },
        42161: {
          gas: {
            price: {
              selected: 'standard',
              levels: { slow: '', standard: '', fast: '', asap: '', custom: '' }
            }
          }
        }
      }
    }
  }
}

jest.mock('../../../main/provider/connection', () => ({
  createJsonRpcProvider: (target: any) => (mockConnections as any)[target].connection,
  listenForProviderClose: jest.fn(),
  sendRpcPayload: (provider: any, payload: any) => provider.send(payload.method, payload.params || [])
}))
jest.mock('../../../main/store/state', () => () => state)
jest.mock('../../../main/accounts', () => ({ updatePendingFees: jest.fn() }))

const mockConnections = {
  'https://ethereum-sepolia-rpc.publicnode.com': {
    id: '11155111',
    name: 'sepolia',
    connection: new MockConnection(11155111)
  },
  'https://polygon-bor-rpc.publicnode.com': {
    id: '137',
    name: 'polygon',
    connection: new MockConnection(137)
  },
  'https://arb1.arbitrum.io/rpc': {
    id: '42161',
    name: 'arbitrum',
    connection: new MockConnection(42161)
  }
}

let chains: any

const resetChainState = () => {
  store.set('main', JSON.parse(JSON.stringify(state.main)))
}

const fireStoreObservers = () => {
  ;(store as any).__fireObservers()
}

const waitForConnection = async () => {
  await new Promise((resolve) => process.nextTick(resolve))
  await Promise.resolve()
}

const connectChain = async (chain: any) => {
  store.toggleConnection('ethereum', chain.id, 'primary', true)
  fireStoreObservers()
  await waitForConnection()
}

beforeAll(async () => {
  jest.useRealTimers()
  resetChainState()

  // need to import this after mocks are set up
  chains = (await import('../../../main/chains')).default
  fireStoreObservers()
})

beforeEach(() => {
  resetChainState()
  fireStoreObservers()
  feeHistoryError = undefined

  connectionObserver = store.observer(() => {
    Object.values(mockConnections).forEach((chain) => {
      const primary = store(`main.networks.ethereum.${chain.id}.connection.primary`)

      if (primary.on) {
        ;(chain.connection as any).connect()
      }
    })
  })

  Object.values(mockConnections).forEach((chain) => {
    store.setGasPrices('ethereum', chain.id, {})
    store.setGasFees('ethereum', chain.id, {})
  })
})

afterEach((done) => {
  if (connectionObserver) {
    connectionObserver.remove()
  }

  const activeConnection: any = Object.values(mockConnections).find(
    (conn) => (conn.connection as any).connected
  )

  if (!activeConnection) {
    return done()
  }

  chains.once('close', ({ id }: any) => {
    if (id === activeConnection.id) {
      done()
    } else {
      done(new Error('connection error'))
    }
  })

  store.toggleConnection('ethereum', activeConnection.id, 'primary', false)
  fireStoreObservers()
})

Object.values(mockConnections).forEach((chain) => {
  it(`sets legacy gas prices when fee market data is unavailable on ${chain.name}`, async () => {
    gasPrice = gweiToHex(6)
    feeHistoryError = new Error('fee history unavailable')

    await connectChain(chain)
    await chains.refreshGasFees({ type: 'ethereum', id: parseInt(chain.id) })

    const gas = store(`main.networksMeta.ethereum.${chain.id}.gas.price.levels`)

    expect(gas.fast).toBe(gweiToHex(6))
  })

  it(`sets fee market prices on explicit gas refresh on ${chain.name}`, async () => {
    const expectedBaseFee = 7e9 * 1.125 * 1.125
    const expectedPriorityFee = 32e9

    await connectChain(chain)
    await chains.refreshGasFees({ type: 'ethereum', id: parseInt(chain.id) })

    const gas = store(`main.networksMeta.ethereum.${chain.id}.gas.price`)

    expect(gas.fees.maxBaseFeePerGas).toBe(intToHex(expectedBaseFee))
    expect(gas.fees.maxPriorityFeePerGas).toBe(intToHex(expectedPriorityFee))
    expect(gas.fees.maxFeePerGas).toBe(intToHex(expectedBaseFee + expectedPriorityFee))

    expect(gas.selected).toBe('fast')
    expect(gas.levels.fast).toBe(intToHex(expectedBaseFee + expectedPriorityFee))
  })
})
