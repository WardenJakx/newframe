import { afterAll, afterEach, beforeAll, beforeEach, expect, it, mock } from 'bun:test'
import EventEmitter from 'events'

import { addHexPrefix, intToHex } from '@ethereumjs/util'
import log from 'electron-log'

import { gweiToHex } from '../../../../test/support/util.ts'
import type { RPCRequestPayload } from '../../../shared/domain/rpc.ts'
import { createInternet } from '../../internet/index.ts'
import store from '../../state/store/index.ts'

log.transports.console.level = false

class MockConnection extends EventEmitter {
  chainId: string
  connected = false

  constructor(chainId: number) {
    super()
    this.chainId = addHexPrefix(chainId.toString(16))
  }

  connect = () => {
    if (!this.connected) {
      this.connected = true
      process.nextTick(() => this.emit('connect'))
    }
  }

  close = () => {
    if (this.connected) {
      this.connected = false
      this.emit('close')
    }
  }

  destroy = this.close

  send = (methodOrPayload: string | { method: string }, _params?: readonly unknown[]) => {
    return new Promise((resolve, reject) => {
      const method = typeof methodOrPayload === 'string' ? methodOrPayload : methodOrPayload.method

      if (method === 'eth_chainId') {
        this.connected = true
        return resolve(this.chainId)
      } else if (method === 'eth_gasPrice') {
        return resolve(gasPrice)
      } else if (method === 'eth_feeHistory') {
        if (feeHistoryError) {
          return reject(feeHistoryError)
        }

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

let feeHistoryError: Error | undefined, gasPrice: string

const state = {
  main: {
    currentChain: {
      type: 'ethereum',
      id: '11155111'
    },
    chains: {
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
              chain: '',
              custom: ''
            },
            secondary: {
              on: false,
              current: 'custom',
              status: 'loading',
              connected: false,
              type: '',
              chain: '',
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
              chain: '',
              custom: ''
            },
            secondary: {
              on: false,
              current: 'custom',
              status: 'loading',
              connected: false,
              type: '',
              chain: '',
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
              chain: '',
              custom: ''
            },
            secondary: {
              on: false,
              current: 'custom',
              status: 'loading',
              connected: false,
              type: '',
              chain: '',
              custom: ''
            }
          },
          on: true
        }
      }
    },
    chainsMeta: {
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

await mock.module('../../../features/connections/main/provider/connection.ts', () => ({
  createJsonRpcProvider: (target: keyof typeof mockConnections) => mockConnections[target].connection,
  listenForProviderClose: mock(),
  sendRpcPayload: (provider: MockConnection, payload: RPCRequestPayload) =>
    provider.send(payload.method, payload.params)
}))
await mock.module('../../state/store/state/index.ts', () => () => state)
await mock.module('../../../features/accounts/main/index.ts', () => ({ updatePendingFees: mock() }))

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

let chains: import('./index.ts').Chains

const resetChainState = () => {
  store.setState((current) => {
    Object.assign(current.main, structuredClone(state.main))
  })
}

const internet = createInternet(fetch)

const waitForConnection = async () => {
  await new Promise((resolve) => process.nextTick(resolve))
  await Promise.resolve()
}

const connectChain = async (chain: { id: string }) => {
  store.getState().toggleConnection('ethereum', Number(chain.id), 'primary', true)
  await waitForConnection()
}

beforeAll(async () => {
  resetChainState()

  // need to import this after mocks are set up
  const { Chains } = await import('./index.ts')
  internet.setOpen(true)
  chains = new Chains(store, internet)
  chains.start()
})

afterAll(() => chains.dispose())

beforeEach(() => {
  resetChainState()
  feeHistoryError = undefined

  Object.values(mockConnections).forEach((chain) => {
    store.getState().setGasPrices('ethereum', Number(chain.id), {})
    store.getState().setGasFees('ethereum', Number(chain.id), {})
  })
})

afterEach((done) => {
  const activeConnection = Object.values(mockConnections).find((conn) => conn.connection.connected)

  if (!activeConnection) {
    return done()
  }

  chains.once('close', ({ id }: { id: string }) => {
    if (id === activeConnection.id) {
      done()
    } else {
      done(new Error('connection error'))
    }
  })

  store.getState().toggleConnection('ethereum', Number(activeConnection.id), 'primary', false)
})

Object.values(mockConnections).forEach((chain) => {
  it(`sets legacy gas prices when fee market data is unavailable on ${chain.name}`, async () => {
    gasPrice = gweiToHex(6)
    feeHistoryError = new Error('fee history unavailable')

    await connectChain(chain)
    await chains.refreshGasFees({ type: 'ethereum', id: parseInt(chain.id) })

    const gas = store.getState().main.chainsMeta.ethereum[Number(chain.id)].gas.price.levels

    expect(gas.fast).toBe(gweiToHex(6))
  })

  it(`sets fee market prices on explicit gas refresh on ${chain.name}`, async () => {
    const expectedBaseFee = 7e9 * 1.125 * 1.125
    const expectedPriorityFee = 32e9

    await connectChain(chain)
    await chains.refreshGasFees({ type: 'ethereum', id: parseInt(chain.id) })

    const gas = store.getState().main.chainsMeta.ethereum[Number(chain.id)].gas.price

    expect(gas.fees?.maxBaseFeePerGas).toBe(intToHex(expectedBaseFee))
    expect(gas.fees?.maxPriorityFeePerGas).toBe(intToHex(expectedPriorityFee))
    expect(gas.fees?.maxFeePerGas).toBe(intToHex(expectedBaseFee + expectedPriorityFee))

    expect(gas.selected).toBe('fast')
    expect(gas.levels.fast).toBe(intToHex(expectedBaseFee + expectedPriorityFee))
  })
})

it('closes chain connections while the internet is closed and restores them when it opens', async () => {
  const sepolia = mockConnections['https://ethereum-sepolia-rpc.publicnode.com']
  await connectChain(sepolia)
  expect(chains.connections.ethereum[sepolia.id]).toBeDefined()

  internet.setOpen(false)

  expect(chains.connections.ethereum[sepolia.id]).toBeUndefined()
  expect(store.getState().main.chains.ethereum[Number(sepolia.id)].connection.primary.connected).toBe(false)

  store.getState().toggleConnection('ethereum', 137, 'primary', true)
  expect(chains.connections.ethereum['137']).toBeUndefined()

  internet.setOpen(true)
  await waitForConnection()

  expect(chains.connections.ethereum[sepolia.id]).toBeDefined()
  expect(chains.connections.ethereum['137']).toBeDefined()
  store.getState().toggleConnection('ethereum', 137, 'primary', false)
})
