import { jest } from 'bun:test'
import { EventEmitter } from 'events'

export const persistMock = {
  get: jest.fn(),
  set: jest.fn(),
  queue: jest.fn(),
  clear: jest.fn(),
  writeUpdates: jest.fn()
}

export const linkMock = {
  invoke: jest.fn().mockResolvedValue({}),
  rpc: jest.fn(),
  send: jest.fn()
}

export const windowsMock = {
  broadcast: jest.fn(),
  browserWindows: jest.fn(() => ({ dash: undefined, panel: undefined })),
  showTray: jest.fn()
}

export const navMock = {
  forward: jest.fn(),
  on: jest.fn()
}

export const electronMock = {
  app: {
    getName: jest.fn(() => 'Frame'),
    getPath: jest.fn(() => __dirname),
    getVersion: jest.fn(() => '0.0.0-test'),
    on: jest.fn(),
    quit: jest.fn(),
    relaunch: jest.fn()
  },
  BrowserWindow: jest.fn(),
  clipboard: {
    writeText: jest.fn()
  },
  dialog: {
    showErrorBox: jest.fn(),
    showMessageBoxSync: jest.fn()
  },
  globalShortcut: {
    register: jest.fn(),
    unregister: jest.fn()
  },
  ipcMain: {
    handle: jest.fn(),
    on: jest.fn()
  },
  ipcRenderer: {
    invoke: jest.fn(),
    on: jest.fn(),
    send: jest.fn()
  },
  Menu: {
    buildFromTemplate: jest.fn()
  },
  net: {
    fetch: jest.fn()
  },
  Notification: jest.fn(),
  powerMonitor: {
    on: jest.fn(),
    off: jest.fn()
  },
  protocol: {
    handle: jest.fn(),
    registerSchemesAsPrivileged: jest.fn()
  },
  safeStorage: {
    decryptString: jest.fn(),
    encryptString: jest.fn(),
    isEncryptionAvailable: jest.fn(() => false)
  },
  screen: {
    getPrimaryDisplay: jest.fn()
  },
  shell: {
    openExternal: jest.fn()
  },
  systemPreferences: {
    canPromptTouchID: jest.fn(() => false),
    promptTouchID: jest.fn()
  },
  Tray: jest.fn()
}

const defaultState = () => ({
  address: '',
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
    networks: { ethereum: {} },
    networksMeta: { ethereum: {} },
    orders: {},
    origins: {},
    permissions: {},
    portfolioApiKey: '',
    autoDiscoverTokens: false,
    rates: {},
    scanning: {},
    signers: {},
    tokens: {
      custom: [],
      known: {}
    },
    updater: {
      dontRemind: [],
      lastChecked: 0
    }
  },
  node: {},
  panel: {
    account: { modules: {} },
    show: false,
    view: 'default'
  },
  provider: {
    events: []
  },
  selected: {
    current: '',
    minimized: false,
    open: false,
    requests: {},
    showAccounts: false,
    view: 'default'
  },
  tray: {
    open: false
  },
  view: {
    data: {},
    list: [],
    notifications: {}
  },
  windows: {
    dash: {
      nav: [],
      showing: false
    },
    notify: {
      showing: false
    },
    panel: {
      nav: [],
      showing: false
    }
  }
})

const toPath = (keys: any[]) => keys.join('.').split('.').filter(Boolean)

const observers: Record<string, { fire: () => void; remove: () => void }> = {}
let observerId = 0

let state: any = defaultState()

const get = (obj: any, path: string[]): any => {
  if (!obj) return obj
  if (path.length === 0) return obj
  if (path.length === 1) return obj[path[0]]

  return get(obj[path[0]], path.slice(1))
}

const set = (obj: any, path: string[], value: any): any => {
  if (path.length === 0) return value
  if (path.length === 1) {
    return { ...(obj || {}), [path[0]]: value }
  }

  obj = obj || {}
  obj[path[0]] = set(obj[path[0]], path.slice(1), value)
  return obj
}

const update = (...args: any[]) => {
  const updater = args.pop()
  const path = toPath(args)
  const next = updater(get(state, path))
  state = set(state, path, next)
}

const store = (...keys: any[]) => get(state, toPath(keys))

const merge = (current: any, next: any) => ({ ...(current || {}), ...(next || {}) })
const includesToken = (tokens: any[] = [], token: any) =>
  tokens.some((t) => t.address?.toLowerCase() === token.address?.toLowerCase() && t.chainId === token.chainId)
const tokenId = (token: any) => `${token.chainId}:${token.address?.toLowerCase?.() || token.address}`

store.set = (...newArgs: any[]) => {
  const args = [...newArgs]
  const value = args.pop()
  state = set(state, toPath(args), value)
}

store.clear = () => {
  state = defaultState()
  Object.keys(observers).forEach((id) => delete observers[id])
}

store.__resetState = () => {
  state = defaultState()
}

store.observer = (cb: () => void, id?: string, alt?: () => void) => {
  const observerKey = id || `observer:${observerId++}`
  const run = alt || cb
  const observer = {
    fire: () => {
      run()
    },
    remove: () => {
      delete observers[observerKey]
    }
  }

  observers[observerKey] = observer

  return { ...observer, returned: alt ? cb() : undefined }
}

store.getObserver = (id: string) => observers[id]

store.__fireObservers = () => {
  Object.values({ ...observers }).forEach((observer) => observer.fire())
}

store.api = {
  feed: jest.fn(() => ({ remove: jest.fn() })),
  remove: jest.fn((id: string) => {
    delete observers[id]
  }),
  report: jest.fn(),
  replaceState: jest.fn((nextState: any) => {
    state = nextState
  })
}

store.activateNetwork = (type: string, id: number, on: boolean) => {
  update('main.networks', type, id, (network: any) => merge(network, { on }))
}

store.setPrimary = (type: string, id: number, status: any) => {
  update('main.networks', type, id, 'connection.primary', (primary: any) => merge(primary, status))
}

store.selectPrimary = (type: string, id: number, value: string) => {
  update('main.networks', type, id, 'connection.primary.current', () => value)
}

store.setPrimaryCustom = (type: string, id: number, target: string) => {
  update('main.networks', type, id, 'connection.primary.custom', () => target)
}

store.setSecondary = (type: string, id: number, status: any) => {
  update('main.networks', type, id, 'connection.secondary', (secondary: any) => merge(secondary, status))
}

store.setSecondaryCustom = (type: string, id: number, target: string) => {
  update('main.networks', type, id, 'connection.secondary.custom', () => target)
}

store.toggleConnection = (type: string, id: number, node: string, on?: boolean) => {
  update('main.networks', type, id, 'connection', node, 'on', (value: boolean) =>
    on !== undefined ? on : !value
  )
}

store.setGasFees = (type: string, id: number, fees: any) => {
  update('main.networksMeta', type, id, 'gas.price.fees', () => fees)
}

store.setGasPrices = (type: string, id: number, prices: any) => {
  update('main.networksMeta', type, id, 'gas.price.levels', () => prices)
}

store.setGasDefault = (type: string, id: number, level: string, price?: any) => {
  update('main.networksMeta', type, id, 'gas.price.selected', () => level)
  if (level === 'custom') update('main.networksMeta', type, id, 'gas.price.levels.custom', () => price)
  else update('main.networksMeta', type, id, 'gas.price.lastLevel', () => level)
}

store.setBlockHeight = (chainId: number, blockHeight: number) => {
  update('main.networksMeta.ethereum', chainId, (chainsMeta: any = {}) => ({ ...chainsMeta, blockHeight }))
}

store.setNativeCurrencyData = (type: string, id: number, nativeCurrencyData: any) => {
  update('main.networksMeta', type, id, 'nativeCurrency', (nativeCurrency: any = {}) => ({
    ...nativeCurrency,
    ...nativeCurrencyData,
    symbol: nativeCurrencyData.symbol || nativeCurrencyData.usd?.symbol || nativeCurrency.symbol
  }))
}

store.addNetwork = (network: any) => {
  const id = parseInt(network.id)
  const type = network.type
  update('main.networks', type, id, (_current: any) =>
    merge(
      {
        id,
        type,
        gas: { price: { selected: 'standard', levels: {} } },
        connection: {
          primary: { on: true, connected: false },
          secondary: { on: false, connected: false }
        },
        on: true
      },
      { ...network, id }
    )
  )
  update('main.networksMeta', type, id, (current: any) =>
    merge(current, {
      icon: network.icon || '',
      nativeCurrency: {
        symbol: network.symbol,
        name: network.nativeCurrencyName,
        icon: network.nativeCurrencyIcon,
        decimals: 18,
        usd: { symbol: network.symbol }
      },
      primaryColor: network.primaryColor,
      gas: { price: { selected: 'standard', levels: {} } }
    })
  )
}

store.removeNetwork = (network: any) => {
  const id = parseInt(network.id)
  update('main.networks', network.type, (networks: any = {}) => {
    delete networks[id]
    return networks
  })
  update('main.networksMeta', network.type, (networks: any = {}) => {
    delete networks[id]
    return networks
  })
}

store.updateNetwork = (oldNetwork: any, newNetwork: any) => {
  const oldId = parseInt(oldNetwork.id)
  const newId = parseInt(newNetwork.id)
  const type = newNetwork.type || oldNetwork.type
  const current = store('main.networks', oldNetwork.type, oldId) || {}

  update('main.networks', oldNetwork.type, (networks: any = {}) => {
    delete networks[oldId]
    networks[newId] = merge(current, { ...newNetwork, id: newId, type })
    return networks
  })
  update('main.networksMeta', type, newId, (meta: any) =>
    merge(meta, {
      icon: newNetwork.icon,
      nativeCurrency: {
        ...(meta || {}).nativeCurrency,
        symbol: newNetwork.symbol,
        name: newNetwork.nativeCurrencyName,
        icon: newNetwork.nativeCurrencyIcon
      }
    })
  )
}

store.updateAccount = (account: any) => {
  update('main.accounts', account.id, (current: any = {}) => ({
    ...account,
    balances: current.balances || account.balances || {}
  }))
  update('main.accountOrder', (order: string[] = []) =>
    order.includes(account.id) ? order : [...order, account.id]
  )
}

store.removeAccount = (id: string) => {
  update('main.accounts', (accounts: any = {}) => {
    delete accounts[id]
    return accounts
  })
  update('main.currentAccount', (currentAccount: string) => (currentAccount === id ? '' : currentAccount))
  update('main.accountOrder', (order: string[] = []) => order.filter((accountId) => accountId !== id))
}

store.setAccount = (account: any) => {
  update('selected.current', () => account.id)
  update('main.currentAccount', () => account.id)
  update('selected.minimized', () => false)
  update('selected.open', () => true)
}

store.unsetAccount = () => {
  update('main.currentAccount', () => '')
  update('selected.open', () => false)
  update('selected.minimized', () => true)
  update('selected.current', () => '')
}

store.setPermission = (address: string, permission: any) => {
  update('main.permissions', address, (permissions: any = {}) => ({
    ...permissions,
    [permission.handlerId]: permission
  }))
}

store.revokePermission = (address: string, handlerId: string) => {
  update('main.permissions', address, (permissions: any = {}) => {
    if (!permissions[handlerId]) return permissions

    const nextPermissions = { ...permissions }
    delete nextPermissions[handlerId]
    return nextPermissions
  })
}

store.initOrigin = (originId: string, origin: any) => {
  const now = Date.now()
  update('main.origins', originId, () => ({
    ...origin,
    session: { requests: 1, startedAt: now, lastUpdatedAt: now }
  }))
}

store.addOriginRequest = (originId: string) => {
  update('main.origins', originId, (origin: any) => ({
    ...origin,
    session: {
      ...(origin?.session || {}),
      requests: (origin?.session?.requests || 0) + 1,
      lastUpdatedAt: Date.now()
    }
  }))
}

store.endOriginSession = (originId: string) => {
  update('main.origins', originId, (origin: any) =>
    origin
      ? { ...origin, session: { ...origin.session, endedAt: Date.now(), lastUpdatedAt: Date.now() } }
      : origin
  )
}

store.switchOriginChain = (originId: string, chainId: number, type: string) => {
  update('main.origins', originId, (origin: any) => ({ ...origin, chain: { id: chainId, type } }))
}

store.clearOrigins = () => {
  update('main.origins', () => ({}))
}

store.removeOrigin = (originId: string) => {
  update('main.origins', (origins: any = {}) => {
    delete origins[originId]
    return origins
  })
}

store.trustExtension = (extensionId: string, trusted: boolean) => {
  update('main.knownExtensions', (extensions: any = {}) => ({ ...extensions, [extensionId]: trusted }))
}

store.newSigner = (signer: any) => {
  update('main.signers', (signers: any = {}) => ({
    ...signers,
    [signer.id]: { ...signer, createdAt: Date.now() }
  }))
}

store.updateSigner = (signer: any) => {
  update('main.signers', signer.id, (current: any = {}) => merge(current, signer))
}

store.removeSigner = (id: string) => {
  update('main.signers', (signers: any = {}) => {
    delete signers[id]
    return signers
  })
}

store.updateLattice = (deviceId: string, latticeUpdate: any) => {
  update('main.lattice', deviceId, (current: any = {}) => merge(current, latticeUpdate))
}

store.removeLattice = (deviceId: string) => {
  update('main.lattice', (lattice: any = {}) => {
    delete lattice[deviceId]
    return lattice
  })
}

store.setRates = (rates: any) => {
  update('main.rates', (current: any = {}) => ({ ...current, ...rates }))
}

store.setBalance = (address: string, balance: any) => {
  update('main.balances', address, (balances: any[] = []) => [
    ...balances.filter((b) => b.address !== balance.address || b.chainId !== balance.chainId),
    balance
  ])
}

store.setBalances = (address: string, newBalances: any[]) => {
  update('main.balances', address, (balances: any[] = []) => [
    ...balances.filter((balance) =>
      newBalances.every(
        (newBalance) => balance.chainId !== newBalance.chainId || balance.address !== newBalance.address
      )
    ),
    ...newBalances
  ])
}

store.addKnownTokens = (address: string, tokens: any[]) => {
  update('main.tokens.known', address, (existing: any[] = []) => [
    ...existing.filter((token) => !includesToken(tokens, token)),
    ...tokens.map((token) => ({ ...token, address: token.address.toLowerCase() }))
  ])
}

store.removeKnownTokens = (address: string, tokensToRemove: Set<string>) => {
  update('main.tokens.known', address, (existing: any[] = []) =>
    existing.filter((token) => !tokensToRemove.has(tokenId(token)))
  )
}

store.addCustomTokens = (tokens: any[]) => {
  update('main.tokens.custom', (existing: any[] = []) => [
    ...existing.filter((token) => !includesToken(tokens, token)),
    ...tokens.map((token) => ({ ...token, address: token.address.toLowerCase() }))
  ])
}

store.removeCustomTokens = (tokens: any[]) => {
  const ids = new Set(tokens.map(tokenId))
  update('main.tokens.custom', (existing: any[] = []) => existing.filter((token) => !ids.has(tokenId(token))))
}

store.accountTokensUpdated = (address: string) => {
  update('main.accounts', address, (account: any = {}) => ({
    ...account,
    balances: { ...(account.balances || {}), lastUpdated: Date.now() }
  }))
}

store.setUpdaterLastChecked = (lastChecked: number) => {
  update('main.updater.lastChecked', () => lastChecked)
}

store.upsertSubmittedActivity = (activity: any) => {
  const id = activity?.id
  if (!id) return
  const now = Date.now()

  update('main.activity', id, (current: any = {}) => ({
    ...current,
    ...activity,
    id,
    status: 'submitted',
    submittedAt: activity.submittedAt ?? current.submittedAt ?? now,
    updatedAt: activity.updatedAt ?? now,
    confirmations: activity.confirmations ?? current.confirmations ?? 0
  }))
}

store.updateActivity = (id: string, activityUpdate: any = {}) => {
  if (!id) return
  const now = Date.now()

  update('main.activity', id, (activity: any = { id }) => ({
    ...activity,
    ...activityUpdate,
    id,
    status: activityUpdate.status ?? activity.status ?? 'confirming',
    updatedAt: activityUpdate.updatedAt ?? now
  }))
}

store.finalizeActivity = (id: string, status: string, activityUpdate: any = {}) => {
  if (!id) return
  const now = Date.now()

  update('main.activity', id, (activity: any = { id }) => ({
    ...activity,
    ...activityUpdate,
    id,
    status,
    completedAt: activityUpdate.completedAt ?? now,
    updatedAt: activityUpdate.updatedAt ?? now,
    confirmations: activityUpdate.confirmations ?? activity.confirmations ?? 0
  }))
}

store.pruneActivity = (id: string) => {
  if (!id) return

  update('main.activity', (activity: any = {}) => {
    const nextActivity = { ...activity }
    delete nextActivity[id]
    return nextActivity
  })
}

store.upsertOrder = (order: any) => {
  const orderId = order?.orderId
  if (!orderId) return

  update('main.orders', orderId, (current: any = {}) => ({
    ...current,
    ...order,
    orderId
  }))
}

store.updateOrder = (orderId: string, orderUpdate: any = {}) => {
  if (!orderId || !store('main.orders', orderId)) return

  update('main.orders', orderId, (order: any) => ({ ...order, ...orderUpdate, orderId }))
}

store.upsertPendingNotification = (notification: any) => {
  const id = notification?.id
  if (!id) return
  const now = Date.now()

  update('view.notifications', id, (current: any = {}) => ({
    ...current,
    ...notification,
    id,
    state: 'pending',
    createdAt: notification.createdAt ?? current.createdAt ?? now,
    updatedAt: notification.updatedAt ?? now,
    hidden: notification.hidden ?? false
  }))
}

store.resolveNotification = (id: string, state: 'completed' | 'failed', notificationUpdate: any = {}) => {
  if (!id) return

  update('view.notifications', id, (notification: any) => {
    if (!notification) return notification

    return {
      ...notification,
      ...notificationUpdate,
      id,
      state,
      hidden: notificationUpdate.hidden ?? false,
      updatedAt: notificationUpdate.updatedAt ?? Date.now()
    }
  })
}

store.dismissNotification = (id: string) => {
  if (!id) return
  const now = Date.now()

  update('view.notifications', id, (notification: any = { id }) => ({
    ...notification,
    id,
    hidden: true,
    dismissedAt: now,
    updatedAt: now
  }))
}

store.expireNotification = (id: string) => {
  if (!id) return

  update('view.notifications', (notifications: any = {}) => {
    const nextNotifications = { ...notifications }
    delete nextNotifications[id]
    return nextNotifications
  })
}

store.navClearReq = (handlerId: string) => {
  update('windows.panel.nav', (nav: any[] = []) =>
    nav.filter((navItem) => navItem?.data?.requestId !== handlerId)
  )
}

store.navForward = (windowId: string, crumb: any) => {
  update('windows', windowId, 'nav', (nav: any[] = []) => {
    if (JSON.stringify(nav[0]) !== JSON.stringify(crumb)) return [crumb, ...nav]
    return nav
  })
  update('windows', windowId, 'showing', () => true)
}

store.navDash = jest.fn()
store.navHome = jest.fn()
store.notify = jest.fn()
store.setPanelView = jest.fn()
store.setSignerView = jest.fn()
store.updateBadge = jest.fn()

const defaultStoreImplementation = (...args: any[]) => store(...args)

export const storeMock = Object.assign(jest.fn(defaultStoreImplementation), store)

export const resetStoreMockImplementation = () => {
  storeMock.mockImplementation(defaultStoreImplementation)
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

  kill = jest.fn((_signal?: string) => {
    if (this.killed) return
    this.killed = true
    this.connected = false
    this.channel = null
    this.emit('exit', 0, null)
  })

  send = jest.fn((message: any) => {
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
  fork: jest.fn((_path: string, _args?: any, opts?: any) => {
    const forkedChildProcess = new HotSignerWorkerMock()

    if (opts?.signal) {
      opts.signal.onabort = () => {
        forkedChildProcess.kill('SIGABRT')
      }
    }

    return forkedChildProcess
  })
})
