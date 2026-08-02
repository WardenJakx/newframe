import { afterEach, beforeEach, describe, expect, it, jest as timers, mock } from 'bun:test'

import { createChainsObserver, createOriginChainObserver, getActiveChains } from './chains'
import store from '../store'

const ether = {
  name: 'Ether',
  symbol: 'ETH',
  icon: 'https://assets.coingecko.com/coins/images/ethereum.png',
  decimals: 18
}

const network = (id: number, name: string, on: boolean, connected: boolean, explorer?: string) => ({
  id,
  name,
  explorer,
  connection: { primary: { connected }, secondary: { connected: false } },
  on
})

const chains: any = {
  1: network(1, 'Ethereum Mainnet', true, true, 'https://etherscan.io'),
  137: network(137, 'Polygon', false, true),
  11155111: network(11155111, 'Ethereum Testnet Sepolia', true, false, 'https://sepolia.etherscan.io')
}

const chainMeta: any = {
  1: { nativeCurrency: ether, primaryColor: 'accent1' },
  137: { nativeCurrency: {}, primaryColor: 'accent6' },
  11155111: { nativeCurrency: { ...ether, name: 'Sepolia Ether' }, primaryColor: 'accent2' }
}

const selectedAddress = '0x2796317b0ff8538f253012862c06787adfb8ceb6'

beforeEach(() => {
  timers.useFakeTimers()
  setChains(chains, chainMeta)
})

afterEach(() => {
  timers.useRealTimers()
})

describe('#getActiveChains', () => {
  it('returns all chains that are active', () => {
    expect(getActiveChains(store).map((chain) => chain.chainId)).toEqual([1, 11155111])
  })

  it('returns an EVM chain object', () => {
    const mainnet = getActiveChains(store).find((chain) => chain.chainId === 1)

    expect(mainnet).toStrictEqual({
      chainId: 1,
      networkId: 1,
      name: 'Ethereum Mainnet',
      icon: [{ url: 'https://assets.coingecko.com/coins/images/ethereum.png' }],
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      explorers: [{ url: 'https://etherscan.io' }],
      external: { wallet: { colors: [{ r: 0, g: 210, b: 190, hex: '#00d2be' }] } },
      connected: true
    })
  })
})

describe('#createChainsObserver', () => {
  const handler = { chainsChanged: mock() }
  const optimism = network(10, 'Optimism', true, true, 'https://optimistic.etherscan.io')
  let fireObserver: any

  beforeEach(() => {
    const observer = createChainsObserver(store, handler)

    fireObserver = () => {
      observer()
      timers.runAllTimers()
    }

    handler.chainsChanged = mock()
  })

  it('invokes the handler with EVM chain objects', () => {
    setChains(
      { ...chains, 10: optimism },
      { ...chainMeta, 10: { nativeCurrency: ether, primaryColor: 'accent4' } }
    )

    const expected = getActiveChains(store)
    fireObserver()

    expect(handler.chainsChanged).toHaveBeenCalledWith(selectedAddress, expected)
  })
  ;[
    {
      description: 'added',
      arrange: () => setChains({ ...chains, 10: optimism }, { ...chainMeta, 10: { nativeCurrency: ether } }),
      expected: [1, 10, 11155111]
    },
    {
      description: 'removed',
      arrange: () => {
        const { 11155111: _sepolia, ...remaining } = chains
        setChains(remaining)
      },
      expected: [1]
    },
    {
      description: 'activated',
      arrange: () => setChains({ ...chains, 137: { ...chains[137], on: true } }),
      expected: [1, 137, 11155111]
    },
    {
      description: 'deactivated',
      arrange: () => setChains({ ...chains, 11155111: { ...chains[11155111], on: false } }),
      expected: [1]
    },
    {
      description: 'renamed',
      arrange: () => setChains({ ...chains, 11155111: { ...chains[11155111], name: 'Seppohleea' } }),
      expected: [1, 11155111]
    }
  ].forEach(({ description, arrange, expected }) => {
    it(`invokes the handler when a chain is ${description}`, () => {
      arrange()
      fireObserver()
      expect(handler.chainsChanged.mock.calls[0][1].map((chain: any) => chain.chainId)).toEqual(expected)
    })
  })

  it('does not invoke the handler when no chains have changed', () => {
    fireObserver()

    expect(handler.chainsChanged).not.toHaveBeenCalled()
  })
})

describe('#createOriginChainObserver', () => {
  const handler = { chainChanged: mock(), networkChanged: mock() }
  let observer: any

  const originId = '8073729a-5e59-53b7-9e69-5d9bcff94087'
  const frameTestOrigin = {
    name: 'test.frame',
    chain: { id: 137, type: 'ethereum', connection: { primary: {}, secondary: {} } }
  }

  beforeEach(() => {
    setOrigins({ [originId]: frameTestOrigin })

    observer = createOriginChainObserver(store, handler)

    handler.chainChanged = mock()
    handler.networkChanged = mock()

    // invoke the observer once in order to set the known origins
    observer()
  })

  it('invokes the handler when the chain has changed for a known origin', () => {
    const updatedOrigin = { ...frameTestOrigin, chain: { ...frameTestOrigin.chain, id: 42161 } }
    setOrigins({ [originId]: updatedOrigin })

    observer()

    expect(handler.chainChanged).toHaveBeenCalledWith(42161, originId)
    expect(handler.networkChanged).toHaveBeenCalledWith(42161, originId)
  })

  it('does not invoke the handler the first time an origin is seen', () => {
    const newOrigin = { name: 'send.eth', chain: { type: 'ethereum', id: 4 } }
    setOrigins({ 'some-id': newOrigin })

    observer()

    expect(handler.chainChanged).not.toHaveBeenCalled()
    expect(handler.networkChanged).not.toHaveBeenCalled()
  })
})

// helper functions

function setChains(chainState: any, chainMetaState = chainMeta) {
  store.setState((state: any) => {
    state.main.currentAccount = selectedAddress
    state.main.networks.ethereum = chainState
    state.main.networksMeta.ethereum = chainMetaState
  })
}

function setOrigins(originState: any) {
  store.setState((state: any) => {
    state.main.origins = originState
  })
}
