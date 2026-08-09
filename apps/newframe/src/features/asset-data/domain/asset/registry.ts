import { TokenSchema } from '../../../tokens/domain/state/token.js'

type AssetLabel = 'native' | 'stablecoin' | 'token'

export interface CuratedAsset {
  readonly assetId: string
  readonly chainId: number
  readonly name: string
  readonly symbol: string
  readonly decimals: number
  readonly address?: Address
  readonly assetLabel: AssetLabel
  readonly commonAsset: string
  readonly fixedUsdRate?: number
}

type CuratedTokenInput = Omit<CuratedAsset, 'address' | 'assetId'> & { address: Address }

const CuratedTokenSchema = TokenSchema.pick({
  address: true,
  chainId: true,
  decimals: true,
  name: true,
  symbol: true
})

function token(input: CuratedTokenInput): CuratedAsset {
  const normalizedAddress = input.address.toLowerCase()
  const normalizedToken = CuratedTokenSchema.parse({ ...input, address: normalizedAddress })

  return Object.freeze({
    ...input,
    ...normalizedToken,
    address: normalizedToken.address as Address,
    assetId: `${normalizedToken.chainId}:${normalizedToken.address}`
  })
}

// Primary verification: canonical wrapped-native deployments published by the relevant chains.
// https://docs.optimism.io/chain/token-properties
// https://docs.base.org/base-chain/network-information/base-contracts
// https://docs.blast.io/building/network-information
// https://docs.arbitrum.io/build-decentralized-apps/reference/useful-addresses
const WETH = [
  token({
    address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
    assetLabel: 'token',
    chainId: 1,
    commonAsset: 'ETH',
    decimals: 18,
    name: 'Wrapped Ether',
    symbol: 'WETH'
  }),
  token({
    address: '0x4200000000000000000000000000000000000006',
    assetLabel: 'token',
    chainId: 10,
    commonAsset: 'ETH',
    decimals: 18,
    name: 'Wrapped Ether',
    symbol: 'WETH'
  }),
  token({
    address: '0x4200000000000000000000000000000000000006',
    assetLabel: 'token',
    chainId: 8453,
    commonAsset: 'ETH',
    decimals: 18,
    name: 'Wrapped Ether',
    symbol: 'WETH'
  }),
  token({
    address: '0x4300000000000000000000000000000000000004',
    assetLabel: 'token',
    chainId: 81457,
    commonAsset: 'ETH',
    decimals: 18,
    name: 'Wrapped Ether',
    symbol: 'WETH'
  }),
  token({
    address: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
    assetLabel: 'token',
    chainId: 42161,
    commonAsset: 'ETH',
    decimals: 18,
    name: 'Wrapped Ether',
    symbol: 'WETH'
  })
]

// Primary verification: https://developers.circle.com/stablecoins/usdc-contract-addresses
const USDC = [
  [1, '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'],
  [10, '0x0b2c639c533813f4aa9d7837caf62653d097ff85'],
  [137, '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359'],
  [999, '0xb88339cb7199b77e23db6e890353e22632ba630f'],
  [8453, '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'],
  [42161, '0xaf88d065e77c8cc2239327c5edb3a432268e5831'],
  [43114, '0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e'],
  [143, '0x754704bc059f8c67012fed69bc8a327a5aafb603']
].map(([chainId, address]) =>
  token({
    address: address as Address,
    assetLabel: 'stablecoin',
    chainId: chainId as number,
    commonAsset: 'USDC',
    decimals: 6,
    fixedUsdRate: 1,
    name: 'USD Coin',
    symbol: 'USDC'
  })
)

// Primary verification: https://tether.to/en/supported-protocols/
const USDT = [
  [1, '0xdac17f958d2ee523a2206206994597c13d831ec7'],
  [43114, '0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7']
].map(([chainId, address]) =>
  token({
    address: address as Address,
    assetLabel: 'stablecoin',
    chainId: chainId as number,
    commonAsset: 'USDT',
    decimals: 6,
    fixedUsdRate: 1,
    name: 'Tether USD',
    symbol: 'USDT'
  })
)

// Primary verification: https://docs.usdt0.to/technical-documentation/deployments
const USDT0 = [
  [10, '0x01bff41798a0bcf287b996046ca68b395dbc1071'],
  [999, '0xb8ce59fc3717ada4c02eadf9682a9e934f625ebb'],
  [9745, '0xb8ce59fc3717ada4c02eadf9682a9e934f625ebb'],
  [143, '0xe7cd86e13ac4309349f30b3435a9d337750fc82d']
].map(([chainId, address]) =>
  token({
    address: address as Address,
    assetLabel: 'stablecoin',
    chainId: chainId as number,
    commonAsset: 'USDT0',
    decimals: 6,
    fixedUsdRate: 1,
    name: 'USD₮0',
    symbol: 'USDT0'
  })
)

// Primary verification: https://wbtc.network/
const WBTC = [
  [1, '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599'],
  [56, '0x39665e85a68a4d7328b8799135e2ff301a0ca86f'],
  [8453, '0x1cea84203673764244e05693e42e6ace62be9ba5']
].map(([chainId, address]) =>
  token({
    address: address as Address,
    assetLabel: 'token',
    chainId: chainId as number,
    commonAsset: 'WBTC',
    decimals: 8,
    name: 'Wrapped Bitcoin',
    symbol: 'WBTC'
  })
)

// Primary verification: https://www.coinbase.com/cbbtc
const CBBTC = [1, 8453, 42161].map((chainId) =>
  token({
    address: '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf',
    assetLabel: 'token',
    chainId,
    commonAsset: 'cbBTC',
    decimals: 8,
    name: 'Coinbase Wrapped BTC',
    symbol: 'cbBTC'
  })
)

const entries = [...WETH, ...USDC, ...USDT, ...USDT0, ...WBTC, ...CBBTC]

if (process.env.NODE_ENV !== 'production') {
  const assetIds = new Set<string>()

  entries.forEach(({ assetId }) => {
    if (assetIds.has(assetId)) throw new Error(`Duplicate curated assetId: ${assetId}`)
    assetIds.add(assetId)
  })
}

export const CURATED_ASSETS: readonly CuratedAsset[] = Object.freeze(entries)
