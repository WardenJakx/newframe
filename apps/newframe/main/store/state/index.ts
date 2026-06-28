import { v4 as generateUuid, v5 as uuidv5 } from 'uuid'
import { z } from 'zod'
import log from 'electron-log'

import persist from '../persist'
import migrations from '../migrate'

import { MAINNET_ETH_ICON } from '../../../resources/domain/balance'
import { MainSchema, Main } from './types/main'

import type { Origin } from './types/origin'
import type { Chain } from './types/chain'

export type { ChainId, Chain, ChainMetadata } from './types/chain'
export type { Origin } from './types/origin'
export type { Permission } from './types/permission'
export type { Balance } from './types/balance'
export type { WithTokenId, Token } from './types/token'
export type { NativeCurrency } from './types/nativeCurrency'
export type { Gas, GasFees } from './types/gas'
export type { Rate } from './types/rate'
export type { ColorwayPalette } from './types/colors'

const StateSchema = z.object({
  main: MainSchema
})

const latestStateVersion = () => {
  // TODO: validate state and type it here?
  // TODO: what does this top-level state object look like?
  const state = persist.get('main') as any
  if (!state || !state.__) {
    // log.info('Persisted state: returning base state')
    return state
  }

  // valid states are less than or equal to the latest migration we know about
  const versions = Object.keys(state.__)
    .filter((v) => parseInt(v) <= migrations.latest)
    .sort((a, b) => parseInt(a) - parseInt(b))

  if (versions.length === 0) {
    // log.info('Persisted state: returning base state')
    return state
  }

  const latest = versions[versions.length - 1]
  // log.info('Persisted state: returning latest state version: ', latest)
  return state.__[latest].main
}

const get = (path: string, obj = latestStateVersion()) => {
  path.split('.').some((key) => {
    if (typeof obj !== 'object') {
      obj = undefined
    } else {
      obj = obj[key]
    }
    return obj === undefined // Stop navigating the path if we get to undefined value
  })
  return obj
}

const main = (path: string, def: any) => {
  const found = get(path)
  if (found === undefined) return def
  return found
}

// TODO: remove pieces of this as they're added to the main state definition
type M = Main & {
  shortcuts: any
  lattice: any
  latticeSettings: any
  ledger: any
  trezor: any
  addresses: any
  tokens: any
  rates: any
  signers: any
  savedSigners: any
  frames: any
  dapp: any
}

const defaultEnabledEthereumChainIds = new Set([1, 10, 56, 137, 999, 8453, 42161, 43114])

const networkGas = () => ({
  price: {
    selected: 'standard',
    levels: { slow: '', standard: '', fast: '', asap: '', custom: '' }
  }
})

const networkMetaGas = () => ({
  fees: {},
  price: {
    selected: 'standard',
    levels: { slow: '', standard: '', fast: '', asap: '', custom: '' }
  }
})

const customRpcConnection = (primaryRpc: string) => ({
  primary: {
    on: true,
    current: 'custom',
    status: 'loading',
    connected: false,
    type: '',
    network: '',
    custom: primaryRpc
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
})

const requiredDefaultEthereumNetworks: Record<number, any> = {
  56: {
    id: 56,
    type: 'ethereum',
    layer: 'sidechain',
    isTestnet: false,
    name: 'BNB Smart Chain',
    explorer: 'https://bscscan.com',
    gas: networkGas(),
    connection: customRpcConnection('https://bsc-dataseed.bnbchain.org'),
    on: true
  },
  999: {
    id: 999,
    type: 'ethereum',
    layer: 'mainnet',
    isTestnet: false,
    name: 'HyperEVM',
    explorer: 'https://hyperevmscan.io',
    gas: networkGas(),
    connection: customRpcConnection('https://rpc.hyperliquid.xyz/evm'),
    on: true
  },
  43114: {
    id: 43114,
    type: 'ethereum',
    layer: 'sidechain',
    isTestnet: false,
    name: 'Avalanche',
    explorer: 'https://snowtrace.io',
    gas: networkGas(),
    connection: customRpcConnection('https://api.avax.network/ext/bc/C/rpc'),
    on: true
  }
}

const requiredDefaultEthereumNetworksMeta: Record<number, any> = {
  56: {
    blockHeight: 0,
    gas: networkMetaGas(),
    nativeCurrency: {
      symbol: 'BNB',
      usd: {
        price: 0,
        change24hr: 0
      },
      icon: '',
      name: 'BNB',
      decimals: 18
    },
    icon: '',
    primaryColor: 'accent8'
  },
  999: {
    blockHeight: 0,
    gas: networkMetaGas(),
    nativeCurrency: {
      symbol: 'HYPE',
      usd: {
        price: 0,
        change24hr: 0
      },
      icon: '',
      name: 'HYPE',
      decimals: 18
    },
    icon: '',
    primaryColor: 'accent3'
  },
  43114: {
    blockHeight: 0,
    gas: networkMetaGas(),
    nativeCurrency: {
      symbol: 'AVAX',
      usd: {
        price: 0,
        change24hr: 0
      },
      icon: '',
      name: 'Avalanche',
      decimals: 18
    },
    icon: '',
    primaryColor: 'accent8'
  }
}

const clone = (value: any) => JSON.parse(JSON.stringify(value))
const persistedPortfolioApiKey = main('portfolioApiKey', '')
const portfolioApiKey =
  typeof persistedPortfolioApiKey === 'string' ? persistedPortfolioApiKey.replace(/\s+/g, '') : ''

const mainState: M = {
  _version: main('_version', 1),
  instanceId: main('instanceId', generateUuid()),
  colorway: main('colorway', 'dark'),
  colorwayPrimary: {
    dark: {
      background: 'rgb(26, 22, 28)',
      text: 'rgb(241, 241, 255)'
    },
    light: {
      background: 'rgb(240, 230, 243)',
      text: 'rgb(20, 40, 60)'
    }
  },
  mute: {
    alphaWarning: main('mute.alphaWarning', false),
    welcomeWarning: main('mute.welcomeWarning', false),
    externalLinkWarning: main('mute.externalLinkWarning', false),
    explorerWarning: main('mute.explorerWarning', false),
    signerRelockChange: main('mute.signerRelockChange', false),
    gasFeeWarning: main('mute.gasFeeWarning', false),
    betaDisclosure: main('mute.betaDisclosure', false),
    onboardingWindow: main('mute.onboardingWindow', false),
    signerCompatibilityWarning: main('mute.signerCompatibilityWarning', false)
  },
  shortcuts: {
    summon: main('shortcuts.summon', {
      modifierKeys: ['Alt'],
      shortcutKey: 'Slash',
      enabled: true,
      configuring: false
    })
  },
  // showUSDValue: main('showUSDValue', true),
  launch: main('launch', false),
  reveal: main('reveal', false),
  showLocalNameWithENS: main('showLocalNameWithENS', false),
  autoDiscoverTokens: Boolean(portfolioApiKey) && main('autoDiscoverTokens', false),
  portfolioApiKey,
  showTestnets: main('showTestnets', false),
  autohide: main('autohide', false),
  accountCloseLock: main('accountCloseLock', false),
  hardwareDerivation: main('hardwareDerivation', 'mainnet'),
  menubarGasPrice: main('menubarGasPrice', false),
  biometricUnlock: main('biometricUnlock', false),
  lattice: main('lattice', {}),
  latticeSettings: {
    accountLimit: main('latticeSettings.accountLimit', 5),
    derivation: main('latticeSettings.derivation', 'standard'),
    endpointMode: main('latticeSettings.endpointMode', 'default'),
    endpointCustom: main('latticeSettings.endpointCustom', '')
  },
  ledger: {
    derivation: main('ledger.derivation', 'live'),
    liveAccountLimit: main('ledger.liveAccountLimit', 5)
  },
  trezor: {
    derivation: main('trezor.derivation', 'standard')
  },
  origins: main('origins', {}),
  knownExtensions: main('knownExtensions', {}),
  accounts: main('accounts', {}),
  currentAccount: main('currentAccount', ''),
  accountsMeta: main('accountsMeta', {}),
  addresses: main('addresses', {}), // Should be removed after 0.5 release
  permissions: main('permissions', {}),
  balances: main('balances', {}),
  accountOrder: main('accountOrder', []),
  tokens: main('tokens', { custom: [], known: {} }),
  rates: main('rates', {}),
  signers: {},
  savedSigners: {},
  updater: {
    dontRemind: main('updater.dontRemind', []),
    lastChecked: main('updater.lastChecked', 0)
  },
  networks: main('networks', {
    ethereum: {
      1: {
        id: 1,
        type: 'ethereum',
        layer: 'mainnet',
        name: 'Mainnet',
        isTestnet: false,
        explorer: 'https://etherscan.io',
        gas: {
          price: {
            selected: 'standard',
            levels: { slow: '', standard: '', fast: '', asap: '', custom: '' }
          }
        },
        connection: {
          primary: {
            on: true,
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
      10: {
        id: 10,
        type: 'ethereum',
        layer: 'rollup',
        isTestnet: false,
        name: 'Optimism',
        explorer: 'https://optimistic.etherscan.io',
        gas: {
          price: {
            selected: 'standard',
            levels: { slow: '', standard: '', fast: '', asap: '', custom: '' }
          }
        },
        connection: {
          primary: {
            on: true,
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
      56: {
        id: 56,
        type: 'ethereum',
        layer: 'sidechain',
        isTestnet: false,
        name: 'BNB Smart Chain',
        explorer: 'https://bscscan.com',
        gas: {
          price: {
            selected: 'standard',
            levels: { slow: '', standard: '', fast: '', asap: '', custom: '' }
          }
        },
        connection: {
          primary: {
            on: true,
            current: 'custom',
            status: 'loading',
            connected: false,
            type: '',
            network: '',
            custom: 'https://bsc-dataseed.bnbchain.org'
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
      100: {
        id: 100,
        type: 'ethereum',
        layer: 'sidechain',
        isTestnet: false,
        name: 'Gnosis',
        explorer: 'https://blockscout.com/xdai/mainnet',
        gas: {
          price: {
            selected: 'standard',
            levels: { slow: '', standard: '', fast: '', asap: '', custom: '' }
          }
        },
        connection: {
          primary: {
            on: false,
            current: 'custom',
            status: 'loading',
            connected: false,
            type: '',
            network: '',
            custom: 'https://rpc.gnosischain.com'
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
        on: false
      },
      137: {
        id: 137,
        type: 'ethereum',
        layer: 'sidechain',
        isTestnet: false,
        name: 'Polygon',
        explorer: 'https://polygonscan.com',
        gas: {
          price: {
            selected: 'standard',
            levels: { slow: '', standard: '', fast: '', asap: '', custom: '' }
          }
        },
        connection: {
          primary: {
            on: true,
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
      999: {
        id: 999,
        type: 'ethereum',
        layer: 'mainnet',
        isTestnet: false,
        name: 'HyperEVM',
        explorer: 'https://hyperevmscan.io',
        gas: {
          price: {
            selected: 'standard',
            levels: { slow: '', standard: '', fast: '', asap: '', custom: '' }
          }
        },
        connection: {
          primary: {
            on: true,
            current: 'custom',
            status: 'loading',
            connected: false,
            type: '',
            network: '',
            custom: 'https://rpc.hyperliquid.xyz/evm'
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
      8453: {
        id: 8453,
        type: 'ethereum',
        layer: 'rollup',
        isTestnet: false,
        name: 'Base',
        explorer: 'https://basescan.org',
        gas: {
          price: {
            selected: 'standard',
            levels: { slow: '', standard: '', fast: '', asap: '', custom: '' }
          }
        },
        connection: {
          primary: {
            on: true,
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
        layer: 'rollup',
        isTestnet: false,
        name: 'Arbitrum',
        explorer: 'https://arbiscan.io',
        gas: {
          price: {
            selected: 'standard',
            levels: { slow: '', standard: '', fast: '', asap: '', custom: '' }
          }
        },
        connection: {
          primary: {
            on: true,
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
      43114: {
        id: 43114,
        type: 'ethereum',
        layer: 'sidechain',
        isTestnet: false,
        name: 'Avalanche',
        explorer: 'https://snowtrace.io',
        gas: {
          price: {
            selected: 'standard',
            levels: { slow: '', standard: '', fast: '', asap: '', custom: '' }
          }
        },
        connection: {
          primary: {
            on: true,
            current: 'custom',
            status: 'loading',
            connected: false,
            type: '',
            network: '',
            custom: 'https://api.avax.network/ext/bc/C/rpc'
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
      84532: {
        id: 84532,
        type: 'ethereum',
        layer: 'testnet',
        isTestnet: true,
        name: 'Base Sepolia',
        explorer: 'https://sepolia.basescan.org/',
        gas: {
          price: {
            selected: 'standard',
            levels: { slow: '', standard: '', fast: '', asap: '', custom: '' }
          }
        },
        connection: {
          primary: {
            on: true,
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
        on: false
      },
      11155111: {
        id: 11155111,
        type: 'ethereum',
        layer: 'testnet',
        isTestnet: true,
        name: 'Sepolia',
        explorer: 'https://sepolia.etherscan.io',
        gas: {
          price: {
            selected: 'standard',
            levels: { slow: '', standard: '', fast: '', asap: '', custom: '' }
          }
        },
        connection: {
          primary: {
            on: true,
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
        on: false
      },
      11155420: {
        id: 11155420,
        type: 'ethereum',
        layer: 'testnet',
        isTestnet: true,
        name: 'Optimism Sepolia',
        explorer: 'https://sepolia-optimism.etherscan.io/',
        gas: {
          price: {
            selected: 'standard',
            levels: { slow: '', standard: '', fast: '', asap: '', custom: '' }
          }
        },
        connection: {
          primary: {
            on: true,
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
        on: false
      }
    }
  }),
  networksMeta: main('networksMeta', {
    ethereum: {
      1: {
        blockHeight: 0,
        gas: {
          fees: {},
          price: {
            selected: 'standard',
            levels: { slow: '', standard: '', fast: '', asap: '', custom: '' }
          }
        },
        nativeCurrency: {
          symbol: 'ETH',
          usd: {
            price: 0,
            change24hr: 0
          },
          icon: MAINNET_ETH_ICON,
          name: 'Ether',
          decimals: 18
        },
        icon: '',
        primaryColor: 'accent1' // Mainnet
      },
      10: {
        blockHeight: 0,
        gas: {
          fees: {},
          price: {
            selected: 'standard',
            levels: { slow: '', standard: '', fast: '', asap: '', custom: '' }
          }
        },
        nativeCurrency: {
          usd: {
            price: 0,
            change24hr: 0
          },
          icon: '',
          name: 'Ether',
          symbol: 'ETH',
          decimals: 18
        },
        icon: 'https://frame.nyc3.cdn.digitaloceanspaces.com/icons/optimism.svg',
        primaryColor: 'accent4' // Optimism
      },
      56: {
        blockHeight: 0,
        gas: {
          fees: {},
          price: {
            selected: 'standard',
            levels: { slow: '', standard: '', fast: '', asap: '', custom: '' }
          }
        },
        nativeCurrency: {
          symbol: 'BNB',
          usd: {
            price: 0,
            change24hr: 0
          },
          icon: '',
          name: 'BNB',
          decimals: 18
        },
        icon: '',
        primaryColor: 'accent8' // BNB Smart Chain
      },
      100: {
        blockHeight: 0,
        gas: {
          fees: {},
          price: {
            selected: 'standard',
            levels: { slow: '', standard: '', fast: '', asap: '', custom: '' }
          }
        },
        nativeCurrency: {
          symbol: 'xDAI',
          usd: {
            price: 0,
            change24hr: 0
          },
          icon: '',
          name: 'xDAI',
          decimals: 18
        },
        icon: 'https://frame.nyc3.cdn.digitaloceanspaces.com/icons/gnosis.svg',
        primaryColor: 'accent5' // Gnosis
      },
      137: {
        blockHeight: 0,
        gas: {
          fees: {},
          price: {
            selected: 'standard',
            levels: { slow: '', standard: '', fast: '', asap: '', custom: '' }
          }
        },
        nativeCurrency: {
          symbol: 'MATIC',
          usd: {
            price: 0,
            change24hr: 0
          },
          icon: '',
          name: 'Matic',
          decimals: 18
        },
        icon: 'https://frame.nyc3.cdn.digitaloceanspaces.com/icons/polygon.svg',
        primaryColor: 'accent6' // Polygon
      },
      999: {
        blockHeight: 0,
        gas: {
          fees: {},
          price: {
            selected: 'standard',
            levels: { slow: '', standard: '', fast: '', asap: '', custom: '' }
          }
        },
        nativeCurrency: {
          symbol: 'HYPE',
          usd: {
            price: 0,
            change24hr: 0
          },
          icon: '',
          name: 'HYPE',
          decimals: 18
        },
        icon: '',
        primaryColor: 'accent3' // HyperEVM
      },
      8453: {
        blockHeight: 0,
        gas: {
          fees: {},
          price: {
            selected: 'standard',
            levels: { slow: '', standard: '', fast: '', asap: '', custom: '' }
          }
        },
        nativeCurrency: {
          symbol: 'ETH',
          usd: {
            price: 0,
            change24hr: 0
          },
          icon: '',
          name: 'Ether',
          decimals: 18
        },
        icon: 'https://frame.nyc3.cdn.digitaloceanspaces.com/baseiconcolor.png',
        primaryColor: 'accent8' // Base
      },
      42161: {
        blockHeight: 0,
        gas: {
          fees: {},
          price: {
            selected: 'standard',
            levels: { slow: '', standard: '', fast: '', asap: '', custom: '' }
          }
        },
        nativeCurrency: {
          usd: {
            price: 0,
            change24hr: 0
          },
          icon: '',
          name: 'Ether',
          symbol: 'ETH',
          decimals: 18
        },
        icon: 'https://frame.nyc3.cdn.digitaloceanspaces.com/icons/arbitrum.svg',
        primaryColor: 'accent7' // Arbitrum
      },
      43114: {
        blockHeight: 0,
        gas: {
          fees: {},
          price: {
            selected: 'standard',
            levels: { slow: '', standard: '', fast: '', asap: '', custom: '' }
          }
        },
        nativeCurrency: {
          symbol: 'AVAX',
          usd: {
            price: 0,
            change24hr: 0
          },
          icon: '',
          name: 'Avalanche',
          decimals: 18
        },
        icon: '',
        primaryColor: 'accent8' // Avalanche
      },
      84532: {
        blockHeight: 0,
        gas: {
          fees: {},
          price: {
            selected: 'standard',
            levels: { slow: '', standard: '', fast: '', asap: '', custom: '' }
          }
        },
        nativeCurrency: {
          symbol: 'sepETH',
          usd: {
            price: 0,
            change24hr: 0
          },
          icon: '',
          name: 'Base Sepolia Ether',
          decimals: 18
        },
        icon: 'https://frame.nyc3.cdn.digitaloceanspaces.com/baseiconcolor.png',
        primaryColor: 'accent2' // Testnet
      },
      11155111: {
        blockHeight: 0,
        gas: {
          fees: {},
          price: {
            selected: 'standard',
            levels: { slow: '', standard: '', fast: '', asap: '', custom: '' }
          }
        },
        nativeCurrency: {
          symbol: 'sepETH',
          usd: {
            price: 0,
            change24hr: 0
          },
          icon: '',
          name: 'Sepolia Ether',
          decimals: 18
        },
        icon: '',
        primaryColor: 'accent2' // Testnet
      },
      11155420: {
        blockHeight: 0,
        gas: {
          fees: {},
          price: {
            selected: 'standard',
            levels: { slow: '', standard: '', fast: '', asap: '', custom: '' }
          }
        },
        nativeCurrency: {
          symbol: 'sepETH',
          usd: {
            price: 0,
            change24hr: 0
          },
          icon: '',
          name: 'Optimism Sepolia Ether',
          decimals: 18
        },
        icon: '',
        primaryColor: 'accent2' // Testnet
      }
    }
  }),
  frames: {},
  dapp: {
    details: {},
    map: {
      added: [],
      docked: []
    },
    storage: {},
    removed: []
  }
}

function normalizeDefaultEthereumNetworks() {
  const networks = mainState.networks.ethereum as Record<string, any>
  const networksMeta = mainState.networksMeta.ethereum as Record<string, any>
  const normalizeConnectionPreset = (connection?: { current?: string }) => {
    if (connection?.current === 'pylon') connection.current = 'chainlist'
  }

  Object.entries(requiredDefaultEthereumNetworks).forEach(([chainId, network]) => {
    if (!networks[chainId]) networks[chainId] = clone(network)
  })

  Object.entries(requiredDefaultEthereumNetworksMeta).forEach(([chainId, meta]) => {
    if (!networksMeta[chainId]) networksMeta[chainId] = clone(meta)
  })

  Object.entries(networks).forEach(([chainId, network]) => {
    const shouldBeEnabled = defaultEnabledEthereumChainIds.has(Number(chainId))
    network.on = shouldBeEnabled
    normalizeConnectionPreset(network.connection?.primary)
    normalizeConnectionPreset(network.connection?.secondary)

    if (shouldBeEnabled && network.connection?.primary) {
      network.connection.primary.on = true
    }
  })
}

normalizeDefaultEthereumNetworks()

function currentAccountFromMainState() {
  const accounts = mainState.accounts || {}
  const persistedCurrent = mainState.currentAccount
  if (persistedCurrent && accounts[persistedCurrent]) return persistedCurrent

  const active = Object.keys(accounts).find((id) => accounts[id]?.active)
  if (active) return active

  const ordered = (mainState.accountOrder || []).find((id: string) => accounts[id])
  if (ordered) return ordered

  return Object.keys(accounts)[0] || ''
}

const initial = {
  windows: {
    panel: {
      show: false,
      nav: [],
      footer: {
        height: 40
      }
    },
    dash: {
      show: false,
      nav: [],
      footer: {
        height: 40
      }
    },
    frames: []
  },
  panel: {
    // Panel view
    showing: false,
    nav: [],
    show: false,
    view: 'default',
    viewData: '',
    account: {}
  },
  flow: {},
  dapps: {},
  view: {
    current: '',
    list: [],
    data: {},
    notify: '',
    notifyData: {},
    badge: '',
    addAccount: '', // Add view (needs to be merged into Phase)
    addNetwork: false, // Phase view (needs to be merged with Add)
    clickGuard: false
  },
  signers: {},
  tray: {
    open: false,
    initial: true,
    homeCommand: null
  },
  balances: {},
  selected: {
    minimized: true,
    open: false,
    current: currentAccountFromMainState(),
    view: 'default',
    settings: {
      viewIndex: 0,
      views: ['permissions', 'verify', 'control'],
      subIndex: 0
    },
    addresses: [],
    showAccounts: false,
    accountPage: 0,
    position: {
      scrollTop: 0,
      initial: {
        top: 5,
        left: 5,
        right: 5,
        bottom: 5,
        height: 5,
        index: 0
      }
    }
  },
  frame: {
    type: 'tray'
  },
  node: {
    provider: false
  },
  provider: {
    events: []
  },
  external: {
    rates: {}
  },
  platform: process.platform,
  main: mainState
}

// --- remove state that should not persist from session to session

Object.keys(initial.main.accounts).forEach((id) => {
  // Remove permissions granted to unknown origins
  const permissions = initial.main.permissions[id]
  if (permissions) {
    delete permissions[uuidv5('Unknown', uuidv5.DNS)]

    Object.entries(permissions).forEach(([originId, permission]) => {
      if (!permission.provider) delete permissions[originId]
    })
  }

  // remote lastUpdated timestamp from balances
  // TODO: define account schema more accurately
  // @ts-expect-error -- account schema doesn't include balances
  initial.main.accounts[id].balances = { lastUpdated: undefined }
})

Object.values(initial.main.networks.ethereum as Record<string, Chain>).forEach((chain) => {
  chain.connection.primary = { ...chain.connection.primary, connected: false }
  chain.connection.secondary = { ...chain.connection.secondary, connected: false }
})

initial.main.origins = Object.entries(initial.main.origins as Record<string, Origin>).reduce(
  (origins, [id, origin]) => {
    if (id !== uuidv5('Unknown', uuidv5.DNS)) {
      // don't persist unknown origin
      origins[id] = {
        ...origin,
        session: {
          ...origin.session,
          endedAt: origin.session.lastUpdatedAt
        }
      }
    }

    return origins
  },
  {} as Record<string, Origin>
)

initial.main.knownExtensions = Object.fromEntries(
  Object.entries(initial.main.knownExtensions).filter(([_id, allowed]) => allowed)
)

// ---

export default function () {
  const migratedState = migrations.apply(initial)
  const result = StateSchema.safeParse(migratedState)

  if (!result.success) {
    const issues = result.error.issues
    log.warn(`Found ${issues.length} issues while parsing saved state`, issues)
  }

  return migratedState
}
