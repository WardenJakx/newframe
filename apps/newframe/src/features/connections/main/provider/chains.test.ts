import { afterEach, beforeEach, describe, expect, it, jest as timers, mock } from 'bun:test'

import store from '../../../../platform/state-store'
import type { Origin } from '../../../connections/domain/state/origin'
import type { Chain, ChainMetadata } from '../../../networks/domain/state/chain'
import { createChainsObserver, createOriginChainObserver, getActiveChains } from './chains'

const ether = {
  name: 'Ether',
  symbol: 'ETH',
  icon: 'https://assets.coingecko.com/coins/images/ethereum.png',
  decimals: 18
}

const connection = (connected: boolean) => ({
  on: true,
  connected,
  current: 'chainlist' as const,
  status: connected ? ('connected' as const) : ('disconnected' as const),
  custom: ''
})

const network = (id: number, name: string, on: boolean, connected: boolean, explorer = ''): Chain => ({
  id,
  type: 'ethereum',
  name,
  explorer,
  connection: { primary: connection(connected), secondary: connection(false) },
  on,
  isTestnet: id !== 1
})

const chains: Record<number, Chain> = {
  1: network(1, 'Ethereum Mainnet', true, true, 'https://etherscan.io'),
  137: network(137, 'Polygon', false, true),
  11155111: network(11155111, 'Ethereum Testnet Sepolia', true, false, 'https://sepolia.etherscan.io')
}

const metadata = (overrides: Partial<ChainMetadata> = {}): ChainMetadata => ({
  gas: { samples: [], price: { selected: 'fast', levels: {} } },
  nativeCurrency: ether,
  primaryColor: 'accent1',
  ...overrides
})

const chainMeta: Record<number, ChainMetadata> = {
  1: {
    ...metadata(),
    icon: 'https://chain-icons.example/ethereum.png',
    image: { base64: 'aWNvbg==', contentHash: 'test-icon', mimeType: 'image/png' },
    nativeCurrency: ether,
    primaryColor: 'accent1'
  },
  137: metadata({ primaryColor: 'accent6' }),
  11155111: metadata({ nativeCurrency: { ...ether, name: 'Sepolia Ether' }, primaryColor: 'accent2' })
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
  it('returns an EVM chain object', () => {
    const mainnet = getActiveChains(store).find((chain) => chain.chainId === 1)

    expect(mainnet).toStrictEqual({
      chainId: 1,
      networkId: 1,
      name: 'Ethereum Mainnet',
      icon: [{ url: 'data:image/png;base64,aWNvbg==' }],
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      explorers: [{ url: 'https://etherscan.io' }],
      external: { wallet: { colors: [{ r: 0, g: 210, b: 190, hex: '#00d2be' }] } },
      connected: true
    })
  })

  it('does not substitute native-currency art for a missing network icon', () => {
    const sepolia = getActiveChains(store).find((chain) => chain.chainId === 11155111)

    expect(sepolia?.icon).toEqual([])
  })
})

describe('#createChainsObserver', () => {
  const handler = {
    chainsChanged: mock((_address: string, _chains: ReturnType<typeof getActiveChains>) => {})
  }
  const optimism = network(10, 'Optimism', true, true, 'https://optimistic.etherscan.io')
  let fireObserver: () => void

  beforeEach(() => {
    const observer = createChainsObserver(store, handler)

    fireObserver = () => {
      observer()
      timers.runAllTimers()
    }

    handler.chainsChanged = mock()
  })

  ;[
    {
      description: 'added',
      arrange: () => setChains({ ...chains, 10: optimism }, { ...chainMeta, 10: metadata() }),
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
      expect(handler.chainsChanged.mock.calls[0][1].map((chain) => chain.chainId)).toEqual(expected)
    })
  })

  it('does not invoke the handler when no chains have changed', () => {
    fireObserver()

    expect(handler.chainsChanged).not.toHaveBeenCalled()
  })
})

describe('#createOriginChainObserver', () => {
  const handler = { chainChanged: mock(), networkChanged: mock() }
  let observer: () => void

  const originId = '8073729a-5e59-53b7-9e69-5d9bcff94087'
  const origin = (name: string, chainId: number): Origin => ({
    name,
    chain: { id: chainId, type: 'ethereum' },
    session: { requests: 0, startedAt: 0, lastUpdatedAt: 0 }
  })
  const frameTestOrigin: Origin = {
    ...origin('test.frame', 137),
    name: 'test.frame',
    chain: { id: 137, type: 'ethereum' }
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
    const newOrigin = origin('send.eth', 4)
    setOrigins({ 'some-id': newOrigin })

    observer()

    expect(handler.chainChanged).not.toHaveBeenCalled()
    expect(handler.networkChanged).not.toHaveBeenCalled()
  })
})

// helper functions

function setChains(chainState: Record<number, Chain>, chainMetaState: typeof chainMeta = chainMeta) {
  store.setState((state) => {
    state.main.currentAccount = selectedAddress
    state.main.networks.ethereum = chainState
    state.main.networksMeta.ethereum = chainMetaState
  })
}

function setOrigins(originState: ReturnType<typeof store.getState>['main']['origins']) {
  store.setState((state) => {
    state.main.origins = originState
  })
}
