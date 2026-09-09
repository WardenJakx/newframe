import { MAINNET_ETH_ICON } from '../../../asset-data/domain/balance/index.js'
import {
  FLASH_BASE_USDC_ADDRESS,
  FLASH_BASE_WETH_ADDRESS,
  FLASH_USDC_ADDRESS,
  FLASH_WETH_ADDRESS
} from '../../../transactions/trade/domain/constants.js'
import type { Chain, ChainMetadata } from '../state/chain.js'
type ChainLayer = NonNullable<Chain['layer']>
type RpcPreset = 'chainlist' | 'custom'
type NativeIcon = 'chain' | 'eth'
type FlashDefinition = readonly [order: number, slug: string, weth?: string, usdc?: string]
type ChainDefinition = readonly [
  id: number,
  name: string,
  layer: ChainLayer,
  explorer: string,
  defaultEnabled: boolean,
  rpc: readonly [preset: RpcPreset, url: string],
  icon: string,
  primaryColor: ChainMetadata['primaryColor'],
  nativeCurrency: readonly [symbol: string, name: string, icon: NativeIcon],
  flash?: FlashDefinition
]
const definitions: readonly ChainDefinition[] = [
  [
    1,
    'Mainnet',
    'mainnet',
    'https://etherscan.io',
    true,
    ['chainlist', 'https://ethereum-rpc.publicnode.com'],
    'https://chain-icons.s3.amazonaws.com/ethereum.png',
    'accent1',
    ['ETH', 'Ether', 'eth'],
    [0, 'ethereum', FLASH_WETH_ADDRESS, FLASH_USDC_ADDRESS]
  ],
  [
    10,
    'Optimism',
    'rollup',
    'https://optimistic.etherscan.io',
    true,
    ['chainlist', 'https://mainnet.optimism.io'],
    'https://frame.nyc3.cdn.digitaloceanspaces.com/icons/optimism.svg',
    'accent4',
    ['ETH', 'Ether', 'eth'],
    [1, 'optimism']
  ],
  [
    56,
    'BNB Smart Chain',
    'sidechain',
    'https://bscscan.com',
    true,
    ['custom', 'https://bsc-dataseed.bnbchain.org'],
    'https://chain-icons.s3.amazonaws.com/bsc.png',
    'accent8',
    ['BNB', 'BNB', 'chain'],
    [2, 'bsc']
  ],
  [
    100,
    'Gnosis',
    'sidechain',
    'https://blockscout.com/xdai/mainnet',
    false,
    ['custom', 'https://rpc.gnosischain.com'],
    'https://frame.nyc3.cdn.digitaloceanspaces.com/icons/gnosis.svg',
    'accent5',
    ['xDAI', 'xDAI', 'chain']
  ],
  [
    137,
    'Polygon',
    'sidechain',
    'https://polygonscan.com',
    true,
    ['chainlist', 'https://polygon-bor-rpc.publicnode.com'],
    'https://frame.nyc3.cdn.digitaloceanspaces.com/icons/polygon.svg',
    'accent6',
    ['MATIC', 'Matic', 'chain'],
    [3, 'polygon']
  ],
  [
    143,
    'Monad',
    'mainnet',
    'https://monadvision.com',
    true,
    ['custom', 'https://rpc.monad.xyz'],
    'https://chain-icons.s3.us-east-1.amazonaws.com/monad.png',
    'accent6',
    ['MON', 'Monad', 'chain'],
    [10, 'monad']
  ],
  [
    999,
    'HyperEVM',
    'mainnet',
    'https://hyperevmscan.io',
    true,
    ['custom', 'https://rpc.hyperliquid.xyz/evm'],
    'https://chain-icons.s3.amazonaws.com/chainlist/999',
    'accent3',
    ['HYPE', 'HYPE', 'chain'],
    [4, 'hyperevm']
  ],
  [
    8453,
    'Base',
    'rollup',
    'https://basescan.org',
    true,
    ['chainlist', 'https://mainnet.base.org'],
    'https://frame.nyc3.cdn.digitaloceanspaces.com/baseiconcolor.png',
    'accent8',
    ['ETH', 'Ether', 'eth'],
    [5, 'base', FLASH_BASE_WETH_ADDRESS, FLASH_BASE_USDC_ADDRESS]
  ],
  [
    9745,
    'Plasma',
    'mainnet',
    'https://plasmascan.to',
    true,
    ['custom', 'https://rpc.plasma.to'],
    'https://chain-icons.s3.amazonaws.com/plasma.png',
    'accent5',
    ['XPL', 'Plasma', 'chain'],
    [6, 'plasma']
  ],
  [
    42161,
    'Arbitrum',
    'rollup',
    'https://arbiscan.io',
    true,
    ['chainlist', 'https://arb1.arbitrum.io/rpc'],
    'https://frame.nyc3.cdn.digitaloceanspaces.com/icons/arbitrum.svg',
    'accent7',
    ['ETH', 'Ether', 'eth'],
    [8, 'arbitrum']
  ],
  [
    43114,
    'Avalanche',
    'sidechain',
    'https://snowtrace.io',
    true,
    ['custom', 'https://api.avax.network/ext/bc/C/rpc'],
    'https://chain-icons.s3.amazonaws.com/avalanche.png',
    'accent8',
    ['AVAX', 'Avalanche', 'chain'],
    [9, 'avalanche']
  ],
  [
    81457,
    'Blast',
    'rollup',
    'https://blastscan.io',
    true,
    ['custom', 'https://rpc.blast.io'],
    'https://chain-icons.s3.amazonaws.com/chainlist/81457',
    'accent4',
    ['ETH', 'Ether', 'eth'],
    [7, 'blast']
  ],
  [
    84532,
    'Base Sepolia',
    'testnet',
    'https://sepolia.basescan.org/',
    false,
    ['chainlist', 'https://sepolia.base.org'],
    'https://frame.nyc3.cdn.digitaloceanspaces.com/baseiconcolor.png',
    'accent2',
    ['sepETH', 'Base Sepolia Ether', 'eth']
  ],
  [
    11155111,
    'Sepolia',
    'testnet',
    'https://sepolia.etherscan.io',
    false,
    ['chainlist', 'https://ethereum-sepolia-rpc.publicnode.com'],
    'https://chain-icons.s3.amazonaws.com/ethereum.png',
    'accent2',
    ['sepETH', 'Sepolia Ether', 'eth']
  ],
  [
    11155420,
    'Optimism Sepolia',
    'testnet',
    'https://sepolia-optimism.etherscan.io/',
    false,
    ['chainlist', 'https://sepolia.optimism.io'],
    'https://frame.nyc3.cdn.digitaloceanspaces.com/icons/optimism.svg',
    'accent2',
    ['sepETH', 'Optimism Sepolia Ether', 'eth']
  ]
]
export const BUILT_IN_CHAINS = Object.freeze(
  definitions.map(
    ([id, name, layer, explorer, defaultEnabled, [preset, url], icon, primaryColor, native, flash]) => ({
      id,
      name,
      layer,
      isTestnet: layer === 'testnet',
      explorer,
      defaultEnabled,
      rpc: { preset, url },
      icon,
      primaryColor,
      nativeCurrency: {
        symbol: native[0],
        name: native[1],
        icon: native[2] === 'eth' ? MAINNET_ETH_ICON : icon,
        decimals: 18
      },
      ...(flash ? { flash: { order: flash[0], slug: flash[1], weth: flash[2], usdc: flash[3] } } : {})
    })
  )
)
export const BUILT_IN_CHAIN_ICON_URLS: Readonly<Record<number, string>> = Object.freeze(
  Object.fromEntries(BUILT_IN_CHAINS.map(({ id, icon }) => [id, icon]))
)

export function builtInChainIconUrl(chainId: number) {
  return BUILT_IN_CHAIN_ICON_URLS[chainId] || ''
}
export function isBuiltInChain(chainId: number) {
  return Object.hasOwn(BUILT_IN_CHAIN_ICON_URLS, chainId)
}
const gasPrice = () => ({
  selected: 'standard' as const,
  levels: { slow: '', standard: '', fast: '', asap: '', custom: '' }
})
export function createBuiltInNetworks(): Record<number, Chain> {
  return Object.fromEntries(
    BUILT_IN_CHAINS.map((chain) => [
      chain.id,
      {
        id: chain.id,
        type: 'ethereum' as const,
        layer: chain.layer,
        isTestnet: chain.isTestnet,
        name: chain.name,
        explorer: chain.explorer,
        gas: { price: gasPrice() },
        connection: {
          primary: {
            on: chain.defaultEnabled || chain.isTestnet,
            current: chain.rpc.preset,
            status: 'loading' as const,
            connected: false,
            type: '',
            network: '',
            custom: chain.rpc.preset === 'custom' ? chain.rpc.url : ''
          },
          secondary: {
            on: false,
            current: 'custom' as const,
            status: 'loading' as const,
            connected: false,
            type: '',
            network: '',
            custom: ''
          }
        },
        on: chain.defaultEnabled
      }
    ])
  )
}
export function createBuiltInNetworkMetadata(): Record<number, ChainMetadata> {
  return Object.fromEntries(
    BUILT_IN_CHAINS.map((chain) => [
      chain.id,
      {
        gas: { samples: [], price: gasPrice() },
        nativeCurrency: { ...chain.nativeCurrency },
        icon: chain.icon,
        primaryColor: chain.primaryColor
      }
    ])
  )
}
