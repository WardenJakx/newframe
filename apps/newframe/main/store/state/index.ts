import { v4 as generateUuid, v5 as uuidv5 } from 'uuid'
import { z } from 'zod'
import log from 'electron-log'

import { getMainRuntime } from '../../runtime'

import { MAINNET_ETH_ICON } from '../../../resources/domain/balance'
import { builtInChainIconUrl } from '../../../resources/domain/chain'
import { MainSchema, Main } from './types/main'

import type { Origin } from './types/origin'
import type { Chain } from './types/chain'

export type { ChainId, Chain, ChainMetadata } from './types/chain'
export type { Origin } from './types/origin'
export type { Permission } from './types/permission'
export type { Balance } from './types/balance'
export type { WithTokenId, Token, TokenCatalog, TokenImage, TokenRecord, TokenSource } from './types/token'
export type { NativeCurrency } from './types/nativeCurrency'
export type { Gas, GasFees } from './types/gas'
export type { Rate } from './types/rate'
export type { ColorwayPalette } from './types/colors'
export type { Activity, ActivityRecord, ActivityStatus, Orders, OrderRecord } from './types/main'

const StatusNotificationSchema = z
  .object({
    id: z.string(),
    state: z.enum(['pending', 'completed', 'failed']),
    title: z.string().nullable().optional(),
    detail: z.string().nullable().optional(),
    createdAt: z.union([z.number(), z.string(), z.date()]).nullable().optional(),
    updatedAt: z.union([z.number(), z.string(), z.date()]).nullable().optional(),
    expiresAt: z.union([z.number(), z.string(), z.date()]).nullable().optional(),
    dismissedAt: z.union([z.number(), z.string(), z.date()]).nullable().optional(),
    hidden: z.boolean().optional(),
    target: z.unknown().optional(),
    metadata: z.unknown().optional()
  })
  .passthrough()

const ViewSchema = z
  .object({
    notifications: z.record(z.string().describe('Notification Id'), StatusNotificationSchema).default({})
  })
  .passthrough()

export const CanonicalStateSchema = z
  .object({
    main: MainSchema,
    view: ViewSchema
  })
  .passthrough()

export type StatusNotification = z.infer<typeof StatusNotificationSchema>

// TODO: remove pieces of this as they're added to the main state definition
type M = Main & {
  shortcuts: any
  lattice: any
  latticeSettings: any
  ledger: any
  trezor: any
  rates: any
  signers: any
  frames: any
}

const defaultEnabledEthereumChainIds = new Set([1, 10, 56, 137, 999, 8453, 9745, 81457, 42161, 43114, 143])

const networkGas = () => ({
  price: {
    selected: 'standard',
    levels: { slow: '', standard: '', fast: '', asap: '', custom: '' }
  }
})

const networkMetaGas = () => ({
  samples: [],
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
  9745: {
    id: 9745,
    type: 'ethereum',
    layer: 'mainnet',
    isTestnet: false,
    name: 'Plasma',
    explorer: 'https://plasmascan.to',
    gas: networkGas(),
    connection: customRpcConnection('https://rpc.plasma.to'),
    on: true
  },
  81457: {
    id: 81457,
    type: 'ethereum',
    layer: 'rollup',
    isTestnet: false,
    name: 'Blast',
    explorer: 'https://blastscan.io',
    gas: networkGas(),
    connection: customRpcConnection('https://rpc.blast.io'),
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
  },
  143: {
    id: 143,
    type: 'ethereum',
    layer: 'mainnet',
    isTestnet: false,
    name: 'Monad',
    explorer: 'https://monadvision.com',
    gas: networkGas(),
    connection: customRpcConnection('https://rpc.monad.xyz'),
    on: true
  }
}

const requiredDefaultEthereumNetworksMeta: Record<number, any> = {
  56: {
    gas: networkMetaGas(),
    nativeCurrency: {
      symbol: 'BNB',
      usd: {
        price: 0,
        change24hr: 0
      },
      icon: builtInChainIconUrl(56),
      name: 'BNB',
      decimals: 18
    },
    icon: builtInChainIconUrl(56),
    primaryColor: 'accent8'
  },
  999: {
    gas: networkMetaGas(),
    nativeCurrency: {
      symbol: 'HYPE',
      usd: {
        price: 0,
        change24hr: 0
      },
      icon: builtInChainIconUrl(999),
      name: 'HYPE',
      decimals: 18
    },
    icon: builtInChainIconUrl(999),
    primaryColor: 'accent3'
  },
  9745: {
    gas: networkMetaGas(),
    nativeCurrency: {
      symbol: 'XPL',
      usd: {
        price: 0,
        change24hr: 0
      },
      icon: builtInChainIconUrl(9745),
      name: 'Plasma',
      decimals: 18
    },
    icon: builtInChainIconUrl(9745),
    primaryColor: 'accent5'
  },
  81457: {
    gas: networkMetaGas(),
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
    icon: builtInChainIconUrl(81457),
    primaryColor: 'accent4'
  },
  43114: {
    gas: networkMetaGas(),
    nativeCurrency: {
      symbol: 'AVAX',
      usd: {
        price: 0,
        change24hr: 0
      },
      icon: builtInChainIconUrl(43114),
      name: 'Avalanche',
      decimals: 18
    },
    icon: builtInChainIconUrl(43114),
    primaryColor: 'accent8'
  },
  143: {
    gas: networkMetaGas(),
    nativeCurrency: {
      symbol: 'MON',
      usd: {
        price: 0,
        change24hr: 0
      },
      icon: builtInChainIconUrl(143),
      name: 'Monad',
      decimals: 18
    },
    icon: builtInChainIconUrl(143),
    primaryColor: 'accent6'
  }
}

const clone = (value: any) => JSON.parse(JSON.stringify(value))
const mainState: M = {
  instanceId: generateUuid(),
  runtime: getMainRuntime(),
  mute: {
    explorerWarning: false,
    gasFeeWarning: false,
    onboardingWindow: false,
    signerCompatibilityWarning: false
  },
  shortcuts: {
    summon: {
      modifierKeys: ['Alt'],
      shortcutKey: 'Slash',
      enabled: true,
      configuring: false
    }
  },
  launch: false,
  reveal: false,
  showLocalNameWithENS: false,
  autoDiscoverTokens: false,
  portfolioApiKey: '',
  showTestnets: false,
  autohide: false,
  menubarGasPrice: false,
  biometricUnlock: false,
  lattice: {},
  latticeSettings: {
    accountLimit: 5,
    derivation: 'standard',
    endpointMode: 'default',
    endpointCustom: ''
  },
  ledger: {
    derivation: 'live',
    liveAccountLimit: 5
  },
  trezor: {
    derivation: 'standard'
  },
  origins: {},
  knownExtensions: {},
  accounts: {},
  currentAccount: '',
  appLock: { locked: false, vaultExists: false },
  accountsMeta: {},
  permissions: {},
  balances: {},
  activity: {},
  orders: {},
  accountOrder: [],
  tokens: { byId: {}, accountTokenIds: {} },
  rates: {},
  signers: {},
  updater: {
    dontRemind: [],
    lastChecked: 0
  },
  networks: {
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
  },
  networksMeta: {
    ethereum: {
      1: {
        gas: {
          samples: [],
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
        icon: builtInChainIconUrl(1),
        primaryColor: 'accent1' // Mainnet
      },
      10: {
        gas: {
          samples: [],
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
          icon: MAINNET_ETH_ICON,
          name: 'Ether',
          symbol: 'ETH',
          decimals: 18
        },
        icon: builtInChainIconUrl(10),
        primaryColor: 'accent4' // Optimism
      },
      56: {
        gas: {
          samples: [],
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
          icon: builtInChainIconUrl(56),
          name: 'BNB',
          decimals: 18
        },
        icon: builtInChainIconUrl(56),
        primaryColor: 'accent8' // BNB Smart Chain
      },
      100: {
        gas: {
          samples: [],
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
          icon: builtInChainIconUrl(100),
          name: 'xDAI',
          decimals: 18
        },
        icon: builtInChainIconUrl(100),
        primaryColor: 'accent5' // Gnosis
      },
      137: {
        gas: {
          samples: [],
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
          icon: builtInChainIconUrl(137),
          name: 'Matic',
          decimals: 18
        },
        icon: builtInChainIconUrl(137),
        primaryColor: 'accent6' // Polygon
      },
      999: {
        gas: {
          samples: [],
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
          icon: builtInChainIconUrl(999),
          name: 'HYPE',
          decimals: 18
        },
        icon: builtInChainIconUrl(999),
        primaryColor: 'accent3' // HyperEVM
      },
      8453: {
        gas: {
          samples: [],
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
        icon: builtInChainIconUrl(8453),
        primaryColor: 'accent8' // Base
      },
      42161: {
        gas: {
          samples: [],
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
          icon: MAINNET_ETH_ICON,
          name: 'Ether',
          symbol: 'ETH',
          decimals: 18
        },
        icon: builtInChainIconUrl(42161),
        primaryColor: 'accent7' // Arbitrum
      },
      43114: {
        gas: {
          samples: [],
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
          icon: builtInChainIconUrl(43114),
          name: 'Avalanche',
          decimals: 18
        },
        icon: builtInChainIconUrl(43114),
        primaryColor: 'accent8' // Avalanche
      },
      84532: {
        gas: {
          samples: [],
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
          icon: MAINNET_ETH_ICON,
          name: 'Base Sepolia Ether',
          decimals: 18
        },
        icon: builtInChainIconUrl(84532),
        primaryColor: 'accent2' // Testnet
      },
      11155111: {
        gas: {
          samples: [],
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
          icon: MAINNET_ETH_ICON,
          name: 'Sepolia Ether',
          decimals: 18
        },
        icon: builtInChainIconUrl(11155111),
        primaryColor: 'accent2' // Testnet
      },
      11155420: {
        gas: {
          samples: [],
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
          icon: MAINNET_ETH_ICON,
          name: 'Optimism Sepolia Ether',
          decimals: 18
        },
        icon: builtInChainIconUrl(11155420),
        primaryColor: 'accent2' // Testnet
      }
    }
  },
  frames: {}
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

const initial = {
  windows: {
    panel: {
      show: false,
      nav: []
    }
  },
  view: {
    notify: '',
    notifyData: {},
    notifications: {},
    badge: ''
  },
  tray: {
    open: false,
    initial: true,
    homeCommand: null
  },
  selected: {
    minimized: true,
    open: false
  },
  platform: process.platform,
  main: mainState
}

type NavigationEntry = { view: string; data: Record<string, any> }
type WindowState = {
  show: boolean
  nav: NavigationEntry[]
  [key: string]: any
}

export type CanonicalState = Omit<typeof initial, 'main' | 'view' | 'windows'> & {
  main: M
  view: Omit<typeof initial.view, 'notifications'> & {
    notifications: Record<string, StatusNotification>
  }
  windows: {
    panel: WindowState
  }
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

export default function createInitialState(): CanonicalState {
  const state = structuredClone(initial)
  const result = CanonicalStateSchema.safeParse(state)

  if (!result.success) {
    const issues = result.error.issues
    log.warn(`Found ${issues.length} issues while parsing saved state`, issues)
  }

  return state as CanonicalState
}
