import { mock } from 'bun:test'
import { EventEmitter } from 'events'
import { createStore } from 'zustand/vanilla'
import { subscribeWithSelector } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'

import { createCanonicalActions } from '../main/store/actions'

export const persistMock = {
  get: mock(),
  set: mock(),
  queue: mock(),
  clear: mock(),
  writeUpdates: mock()
}

export const linkMock = {
  connectState: mock().mockResolvedValue({ ok: true }),
  disconnectState: mock().mockResolvedValue({ ok: true }),
  executeCommand: mock().mockResolvedValue({ ok: true }),
  executeQuery: mock().mockResolvedValue({ ok: false, error: 'not_found' })
}

export const windowsMock = {
  broadcast: mock(),
  browserWindows: mock(() => ({ panel: undefined })),
  showTray: mock()
}

export const navMock = {
  forward: mock(),
  on: mock()
}

export const electronMock = {
  app: {
    getName: mock(() => 'Frame'),
    getPath: mock(() => __dirname),
    getVersion: mock(() => '0.0.0-test'),
    on: mock(),
    quit: mock(),
    relaunch: mock()
  },
  BrowserWindow: mock(),
  clipboard: {
    writeText: mock()
  },
  dialog: {
    showErrorBox: mock(),
    showMessageBoxSync: mock()
  },
  globalShortcut: {
    register: mock(),
    unregister: mock()
  },
  ipcMain: {
    handle: mock(),
    on: mock()
  },
  ipcRenderer: {
    invoke: mock(),
    on: mock(),
    send: mock()
  },
  Menu: {
    buildFromTemplate: mock()
  },
  net: {
    fetch: mock()
  },
  Notification: mock(),
  powerMonitor: {
    on: mock(),
    off: mock()
  },
  protocol: {
    handle: mock(),
    registerSchemesAsPrivileged: mock()
  },
  safeStorage: {
    decryptString: mock(),
    encryptString: mock(),
    isEncryptionAvailable: mock(() => false)
  },
  screen: {
    getPrimaryDisplay: mock()
  },
  shell: {
    openExternal: mock()
  },
  systemPreferences: {
    canPromptTouchID: mock(() => false),
    promptTouchID: mock()
  },
  Tray: mock()
}

const defaultState = () => ({
  main: {
    accounts: {},
    accountOrder: [],
    accountsMeta: {},
    activity: {},
    balances: {},
    currentAccount: '',
    knownExtensions: {},
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
    networks: { ethereum: {} },
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
            usd: { price: 0, change24hr: 0 },
            icon: '',
            name: 'Ether',
            decimals: 18
          },
          icon: '',
          primaryColor: 'accent1'
        }
      }
    },
    orders: {},
    origins: {},
    permissions: {},
    portfolioApiKey: '',
    autoDiscoverTokens: false,
    rates: {},
    signers: {},
    tokens: {
      byId: {},
      accountTokenIds: {}
    },
    updater: {
      dontRemind: [],
      lastChecked: 0
    }
  },
  selected: {
    minimized: false,
    open: false
  },
  tray: {
    open: false,
    initial: true,
    homeCommand: null
  },
  view: {
    badge: '',
    notifications: {},
    notify: '',
    notifyData: {}
  },
  windows: {
    panel: {
      nav: [],
      show: false
    }
  }
})

let actionImplementations: Record<string, (...args: any[]) => any> = {}
let actionMocks: Record<string, ReturnType<typeof mock>> = {}

const createMockActions = (set: any, get: any) => {
  actionImplementations = createCanonicalActions(set, get) as Record<string, (...args: any[]) => any>
  actionMocks = Object.fromEntries(
    Object.entries(actionImplementations).map(([name, action]) => [
      name,
      mock((...args: any[]) => action(...args))
    ])
  )

  return actionMocks
}

export const storeMock = createStore<any>()(
  subscribeWithSelector(
    immer((set, get) => ({
      ...defaultState(),
      ...createMockActions(set, get)
    }))
  )
)

export const resetStoreState = () => {
  storeMock.setState({ ...defaultState(), ...actionMocks }, true)
}

export const resetStoreMockImplementation = () => {
  const restoredActions: Record<string, ReturnType<typeof mock>> = {}

  Object.entries(actionMocks).forEach(([name, mockAction]) => {
    mockAction.mockImplementation(actionImplementations[name])
    if (storeMock.getState()[name] !== mockAction) restoredActions[name] = mockAction
  })

  if (Object.keys(restoredActions).length > 0) storeMock.setState(restoredActions)
}
const encodeWorkerData = (data: any) => Buffer.from(JSON.stringify(data)).toString('base64url')

const decodeWorkerData = (value: string | null | undefined, password: string) => {
  if (!value) return { keys: [], seed: undefined }

  const data = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
  if (data.password !== password) throw new Error('Invalid password')

  return data
}

class HotSignerWorkerMock extends EventEmitter {
  channel: Record<string, never> | null = {}
  connected = true
  killed = false
  token = 'test-worker-token'
  locked = true

  kill = mock((_signal?: string) => {
    if (this.killed) return
    this.killed = true
    this.connected = false
    this.channel = null
    this.emit('exit', 0, null)
  })

  send = mock((message: any) => {
    if (message?.type === 'getToken') {
      return this.emit('message', { type: 'token', token: this.token })
    }

    if (!message?.id) return

    try {
      const result = this.handleRPC(message.method, message.params)
      this.emit('message', { id: message.id, type: 'rpc', result })
    } catch (e) {
      this.emit('message', { id: message.id, type: 'rpc', error: (e as Error).message })
    }
  })

  handleRPC(method: string, params: any) {
    switch (method) {
      case 'addKey': {
        const current = decodeWorkerData(params.encryptedKeys, params.password)
        return encodeWorkerData({
          kind: 'ring',
          keys: [...(current.keys || []), params.key],
          password: params.password
        })
      }
      case 'removeKey': {
        const current = decodeWorkerData(params.encryptedKeys, params.password)
        const keys = (current.keys || []).filter((_: string, index: number) => index !== params.index)
        return keys.length ? encodeWorkerData({ kind: 'ring', keys, password: params.password }) : null
      }
      case 'encryptSeed':
        return encodeWorkerData({ kind: 'seed', password: params.password, seed: params.seed })
      case 'unlock':
        decodeWorkerData(params.encryptedKeys || params.encryptedSeed, params.password)
        this.locked = false
        return undefined
      case 'lock':
        this.locked = true
        return undefined
      case 'signMessage':
        if (this.locked) throw new Error('Signer locked')
        return '0x' + '11'.repeat(65)
      case 'signTypedData':
        if (this.locked) throw new Error('Signer locked')
        return '0x' + '22'.repeat(65)
      case 'signTransaction':
        if (this.locked) throw new Error('Signer locked')
        return '0x1234'
      case 'exportPrivateKey':
        if (this.locked) throw new Error('Signer locked')
        return '0x' + '33'.repeat(32)
      case 'verifyAddress':
        if (this.locked) throw new Error('Signer locked')
        return params.address !== '0xabcdef'
      default:
        throw new Error(`Invalid method: '${method}'`)
    }
  }
}

export const createHotSignerChildProcessMock = () => ({
  fork: mock((_path: string, _args?: any, opts?: any) => {
    const forkedChildProcess = new HotSignerWorkerMock()

    if (opts?.signal) {
      opts.signal.onabort = () => {
        forkedChildProcess.kill('SIGABRT')
      }
    }

    return forkedChildProcess
  })
})
