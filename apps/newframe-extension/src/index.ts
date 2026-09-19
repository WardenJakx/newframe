/* globals chrome */
import FrameBackgroundProvider, {
  RawFrameConnection,
  type ConnectionRetryState,
  type JsonRpcPayload,
  type JsonRpcResponse
} from './frameConnection'
import { frameStateStore, type AvailableChain, type ConnectionStatus } from './frameState'

type Provider = FrameBackgroundProvider

const subTypes = [
  'chainChanged',
  'chainsChanged',
  'accountsChanged',
  'assetsChanged',
  'networkChanged',
  'message'
]

// extension state
let provider: Provider | null
let dappConnection: RawFrameConnection | null
let settingsPanel: chrome.runtime.Port | null, activeTabId: number
const CONNECTION_REJECTED_KEY = 'extensionConnectionRejected'
const PRIMARY_RETRY_KEY = 'extensionConnectionRetry'
const DAPP_RETRY_KEY = 'extensionDappRetry'
let retryStates: Record<string, unknown> = {}
let connectionPreferenceWrite = Promise.resolve()
let retrying = false

function retryOptions(key: typeof PRIMARY_RETRY_KEY | typeof DAPP_RETRY_KEY) {
  return {
    retryState: retryStates[key],
    onRetryStateChange: (state: ConnectionRetryState) => {
      retryStates[key] = state
      connectionPreferenceWrite = connectionPreferenceWrite
        .then(() => chrome.storage.local.set({ [key]: state }))
        .catch(console.error)
    }
  }
}

interface PendingRequest {
  tabId: number
  payloadId: number
  method: string
  params: unknown
  origin: string
}

interface Subscription {
  tabId: number
  send: (subload: DappPayload) => void
  type: string
}

interface DappPayload {
  id?: number | string
  jsonrpc?: string
  method?: string
  params?: unknown
  result?: unknown
  type?: string
}

interface ExtensionPayload {
  id?: number
  location?: unknown
  method: string
  params?: unknown[]
  src?: string
  tab?: chrome.tabs.Tab
}

interface TabLike {
  id?: number
  url?: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const isDappPayload = (value: unknown): value is DappPayload => isRecord(value)
const isExtensionPayload = (value: unknown): value is ExtensionPayload =>
  isRecord(value) && typeof value.method === 'string'

function tabFromMessage(value: unknown): TabLike | undefined {
  if (!isRecord(value)) {
    return undefined
  }
  const id = typeof value.id === 'number' ? value.id : undefined
  const url = typeof value.url === 'string' ? value.url : undefined
  return id === undefined && url === undefined ? undefined : { id, url }
}

const subs: Record<string, Subscription> = {}
const pending: Record<string, PendingRequest> = {}

interface OriginStatus {
  originId: string
  origin: string
  connected: boolean
  address: string
  selectedAddress?: string
  chainId?: string
}

// helper functions
const originFromUrl = (url?: string) => {
  if (!url) {
    return ''
  }
  const path = url.split('/')
  return `${path[0]}//${path[2]}`
}
const getOrigin = (sender: { url?: string } = {}) => originFromUrl(sender.url)
const isInjectedUrl = (url = '') => url.startsWith('http') || url.startsWith('file')

const subType = (pendingPayload: PendingRequest) => {
  if (!Array.isArray(pendingPayload.params)) {
    return 'unknown'
  }
  const params: unknown[] = pendingPayload.params
  const type = params[0]
  return typeof type === 'string' && subTypes.includes(type) ? type : 'unknown'
}

const unsubscribeTab = (tabId: number) => {
  Object.keys(pending).forEach((id) => {
    if (pending[id]!.tabId === tabId) {
      delete pending[id]
    }
  })
  Object.keys(subs).forEach((sub) => {
    if (subs[sub]!.tabId === tabId) {
      dappConnection?.send({
        id: provider!.nextId++,
        jsonrpc: '2.0',
        method: 'eth_unsubscribe',
        params: [sub]
      })
      delete subs[sub]
    }
  })
}

function updateSettingsPanel() {
  const panel = settingsPanel
  if (!panel) {
    return
  }

  try {
    panel.postMessage(frameStateStore.getState())
  } catch {
    if (settingsPanel === panel) {
      settingsPanel = null
    }
  }
}

frameStateStore.subscribe(updateSettingsPanel)

function setConnectionStatus(connectionStatus: ConnectionStatus) {
  console.debug(`Setting connection status to ${connectionStatus}`)

  frameStateStore.setState({ connectionStatus })
}

function setChains(chains: AvailableChain[]) {
  console.debug('Setting available chains', { chains })

  frameStateStore.setState({ availableChains: chains })
}

function setCurrentChain(chain: string) {
  console.debug(`Setting current chain to ${chain}`)

  frameStateStore.setState({ currentChain: chain })
}

function setOriginStatus(origin: string, siteConnected: boolean, currentAddress = '') {
  console.debug('Setting origin status', { origin, siteConnected, currentAddress })

  frameStateStore.setState({ activeOrigin: origin, siteConnected, currentAddress })
}

function setIcon(path: string) {
  chrome.action.setIcon({ path }).catch(console.error)
}

function setPopup(popup: string) {
  chrome.action.setPopup({ popup }).catch(console.error)
}

async function fetchAvailableChains() {
  if (!provider?.isConnected()) {
    return
  }
  try {
    const chains = await provider.request<AvailableChain[]>({ method: 'wallet_getEthereumChains' })
    setChains(chains)
  } catch (e) {
    console.error('Error fetching chains', e)
    setChains([])
  }
}

async function getActiveTab(): Promise<TabLike | undefined> {
  if (activeTabId) {
    try {
      const activeTab: unknown = await chrome.tabs.get(activeTabId)
      return tabFromMessage(activeTab)
    } catch (e) {
      // fall through to querying the active tab
    }
  }

  const tabs: unknown = await chrome.tabs.query({ active: true, currentWindow: true })
  return Array.isArray(tabs) ? tabFromMessage((tabs as unknown[])[0]) : undefined
}

async function refreshActiveOriginStatus(tab?: TabLike) {
  const activeTab = tab ?? (await getActiveTab())
  const origin = originFromUrl(activeTab?.url)

  if (!activeTab?.id || !isInjectedUrl(activeTab.url ?? '') || !origin) {
    setOriginStatus(origin, false, '')
    return
  }

  if (!provider?.isConnected()) {
    setOriginStatus(origin, false, '')
    return
  }

  try {
    const status = await provider.request<OriginStatus>({
      method: 'frame_getOriginStatus',
      __frameOrigin: origin,
      __extensionConnecting: true
    })

    setOriginStatus(
      status.origin || origin,
      status.connected,
      (status.address || status.selectedAddress) ?? ''
    )
    if (status.chainId) {
      setCurrentChain(status.chainId)
    }
  } catch (e) {
    console.error('Error fetching origin status', e)
    setOriginStatus(origin, false, '')
  }
}

async function disconnectActiveOrigin(tab?: TabLike) {
  const activeTab = tab ?? (await getActiveTab())
  const origin = originFromUrl(activeTab?.url)

  if (!activeTab?.id || !isInjectedUrl(activeTab.url ?? '') || !origin || !provider?.isConnected()) {
    return
  }

  try {
    const status = await provider.request<OriginStatus>({
      method: 'frame_disconnectOrigin',
      __frameOrigin: origin,
      __extensionConnecting: true
    })

    setOriginStatus(status.origin || origin, false, '')
  } catch (e) {
    console.error('Error disconnecting origin', e)
    await refreshActiveOriginStatus(activeTab)
  }
}

async function sendEventToTab(tabId: number, event: string, args?: unknown) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'eth:event', event, args })
  } catch (e) {
    // tabs without our content script (chrome:// pages, stale tabs) can't receive — expected
    if (e instanceof Error && e.message.includes('Receiving end does not exist')) {
      return
    }
    console.error(`Error sending event "${event}"`, e)
  }
}

async function sendEvent(event: string, args: unknown[] = [], selector: chrome.tabs.QueryInfo = {}) {
  const tabs = await chrome.tabs.query(selector)

  await Promise.all(tabs.filter((tab) => !!tab.url).map((tab) => sendEventToTab(tab.id!, event, args)))
}

function initProvider(requestApproval = false) {
  console.log('Initializing provider connection to Newframe')

  const companionUrl = 'ws://127.0.0.1:1248?identity=newframe-extension'
  provider = new FrameBackgroundProvider(`${companionUrl}&scope=internal`, {
    ...retryOptions(PRIMARY_RETRY_KEY),
    requestApproval
  })

  provider.connection.on('connect', () => {
    setConnectionStatus('extension-approval-pending')
  })

  provider.connection.on('close', () => {
    dappConnection?.close()
    dappConnection = null
    setConnectionStatus('desktop-unavailable')
  })

  provider.on('rejected', () => {
    setConnectionStatus('extension-approval-rejected')
  })

  provider.on('connect', () => {
    console.log('Connected to Newframe')

    dappConnection = new RawFrameConnection(companionUrl, retryOptions(DAPP_RETRY_KEY))
    dappConnection.on('payload', (payload: JsonRpcResponse) => {
      handleDappPayload(payload).catch(console.error)
    })
    setConnectionStatus('connected')
    fetchAvailableChains().catch(console.error)
    refreshActiveOriginStatus().catch(console.error)

    setIcon('icons/icon96good.png')
    sendEvent('connect').catch(console.error)
  })

  provider.on('disconnect', () => {
    setConnectionStatus('desktop-unavailable')
    setOriginStatus(frameStateStore.getState().activeOrigin, false, '')

    setIcon('icons/icon96moon.png')
    sendEvent('close').catch(console.error)
  })

  provider.on('chainsChanged', (chains: AvailableChain[] = []) => {
    if (chains[0] && typeof chains[0] === 'object') {
      setChains(chains)
    }
  })

  provider.on('accountsChanged', () => {
    refreshActiveOriginStatus().catch(console.error)
  })

  async function handleDappPayload(value: unknown) {
    if (!isDappPayload(value)) {
      return
    }
    const payload = value
    if (typeof payload.id !== 'undefined') {
      if (pending[payload.id]) {
        const { tabId, payloadId } = pending[payload.id]!
        if (pending[payload.id]!.method === 'eth_subscribe' && typeof payload.result === 'string') {
          subs[payload.result] = {
            tabId,
            send: (subload) => {
              chrome.tabs.sendMessage(tabId, subload).catch((error: unknown) => {
                if (error instanceof Error && error.message.includes('Receiving end does not exist')) {
                  return
                }
                console.error('Error sending subscription payload', error)
              })
            },
            type: subType(pending[payload.id]!)
          }
        } else if (pending[payload.id]!.method === 'eth_unsubscribe') {
          const params = Array.isArray(payload.params) ? payload.params : [payload.params]
          params.forEach((sub) => {
            if (typeof sub === 'string') {
              delete subs[sub]
            }
          })
        }
        chrome.tabs
          .sendMessage(tabId, Object.assign({}, payload, { id: payloadId, type: 'eth:payload' }))
          .catch(() => {})
        if (pending[payload.id]!.method === 'eth_chainId' && pending[payload.id]!.tabId === activeTabId) {
          const payloadOrigin = pending[payload.id]!.origin
          const activeTab = await chrome.tabs.get(activeTabId)
          const activeTabOrigin = originFromUrl(activeTab.url)
          if (activeTabOrigin === payloadOrigin) {
            const chainId = payload.result
            if (typeof chainId === 'string') {
              setCurrentChain(chainId)
            }
          }
        }

        delete pending[payload.id]
      }
    } else if (
      typeof payload.method === 'string' &&
      payload.method.indexOf('_subscription') > -1 &&
      isRecord(payload.params) &&
      typeof payload.params.subscription === 'string' &&
      subs[payload.params.subscription]
    ) {
      // Emit subscription result to tab
      const sub = subs[payload.params.subscription]!
      payload.type = 'eth:payload'
      sub.send(payload)
      if (sub.type === 'chainChanged' && sub.tabId === activeTabId) {
        const chainId = payload.params.result
        if (typeof chainId === 'string') {
          setCurrentChain(chainId)
        }
      }
    }
  }
}

function destroyProvider() {
  dappConnection?.close()
  dappConnection = null

  if (provider) {
    provider.close()
    provider = null
  }
}

function addStateListeners() {
  function setMediaBlob(blobUrl: string, location: unknown, message?: string) {
    const mediaWindow = window as Window & {
      __setMediaBlob__?(blobUrl: string, location: unknown, message?: string): void
    }
    mediaWindow.__setMediaBlob__!(blobUrl, location, message)
  }

  async function handleMessage(extensionPayload: unknown, sender: chrome.runtime.MessageSender) {
    await connectionReady
    if (!isExtensionPayload(extensionPayload)) {
      return
    }
    const { tab, ...payload } = extensionPayload
    const { method, params = [] } = payload

    console.debug('Message received from tab', { tab, payload })

    if (payload.method === 'embedded_action_res') {
      const [action, res] = params
      if (
        isRecord(action) &&
        action.type === 'getChainId' &&
        isRecord(res) &&
        typeof res.chainId === 'string'
      ) {
        return setCurrentChain(res.chainId)
      }
    } else if (payload.method === 'media_blob') {
      const location = payload.location
      const tabId = sender.tab?.id

      if (typeof payload.src !== 'string' || tabId === undefined) {
        return
      }

      try {
        const res = await fetch(payload.src)
        const blob = await res.blob()
        const blobURL = URL.createObjectURL(blob)

        chrome.scripting
          .executeScript({
            target: { tabId },
            func: setMediaBlob,
            args: [blobURL, location]
          })
          .catch(console.error)
      } catch (e) {
        chrome.scripting
          .executeScript({
            target: { tabId },
            func: setMediaBlob,
            args: ['', location, (e as Error).message]
          })
          .catch(console.error)
      }
    }

    if (payload.method === 'frame_retry_connection') {
      if (sender.tab || sender.url !== chrome.runtime.getURL('settings.html')) {
        return
      }
      if (retrying || frameStateStore.getState().connectionStatus === 'connected') {
        return
      }

      retrying = true
      destroyProvider()
      setConnectionStatus('extension-approval-pending')
      try {
        await connectionPreferenceWrite
        await chrome.storage.local.remove([PRIMARY_RETRY_KEY, DAPP_RETRY_KEY, CONNECTION_REJECTED_KEY])
        retryStates = {}
        initProvider(true)
      } catch (error) {
        setConnectionStatus('desktop-unavailable')
        initProvider()
        throw error
      } finally {
        retrying = false
      }
      return
    }

    if (payload.method === 'frame_disconnect_current_site') {
      if (sender.tab) {
        return
      }

      await disconnectActiveOrigin(tab)
      return
    }

    if (payload.method === 'frame_refresh_origin_status') {
      if (sender.tab) {
        return
      }

      await refreshActiveOriginStatus(tab)
      return
    }

    if (payload.method === 'frame_refresh_chains') {
      if (sender.tab) {
        return
      }

      await fetchAvailableChains()
      return
    }

    if (payload.method === 'frame_summon') {
      return provider?.connection.send({ jsonrpc: '2.0', id: 1, method, params })
    }

    if (!provider?.isConnected() || !dappConnection) {
      const tabId = sender.tab?.id ?? tab?.id
      if (tabId === undefined) {
        return
      }
      const rejected = frameStateStore.getState().connectionStatus === 'extension-approval-rejected'
      await chrome.tabs.sendMessage(tabId, {
        type: 'eth:payload',
        id: payload.id,
        jsonrpc: '2.0',
        error: rejected
          ? { code: 4001, message: 'Connection declined. Click Retry connection in Newframe Companion.' }
          : { code: 4900, message: 'Not connected' }
      })
      return
    }

    const id = provider.nextId++
    const origin = getOrigin(tab ?? sender)
    if (!origin) {
      return console.error('No origin found for sender')
    }
    const tabId = sender.tab?.id ?? tab?.id
    if (tabId === undefined || typeof payload.id !== 'number') {
      return
    }
    pending[id] = {
      tabId,
      payloadId: payload.id,
      method,
      params,
      origin
    }

    const load: JsonRpcPayload & { __frameFavicon?: string } = {
      ...payload,
      jsonrpc: '2.0',
      id,
      __frameOrigin: origin,
      __frameFavicon: sender.tab?.favIconUrl,
      __extensionConnecting: undefined
    }

    dappConnection.send(load)
  }

  chrome.runtime.onMessage.addListener((extensionPayload, sender) => {
    handleMessage(extensionPayload, sender).catch(console.error)
  })

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'frame_connect') {
      return
    }

    const onPortDisconnected = () => {
      if (settingsPanel === port) {
        settingsPanel = null
      }
      port.onDisconnect.removeListener(onPortDisconnected)
    }

    settingsPanel = port
    port.onDisconnect.addListener(onPortDisconnected)
    updateSettingsPanel()
    refreshActiveOriginStatus().catch(console.error)
  })
}

async function addTabListeners() {
  // Query for all existing tabs and store their origins
  const tabs = await chrome.tabs.query({})
  const activeTab = tabs.find((tab) => tab.active)

  if (activeTab?.id) {
    activeTabId = activeTab.id
    refreshActiveOriginStatus(activeTab).catch(console.error)
  }

  // Create an object to store the last known origin for each tab
  const tabOrigins: Record<number, string> = {}
  tabs.forEach((tab) => {
    if (tab.id !== undefined) {
      tabOrigins[tab.id] = originFromUrl(tab.url)
    }
  })

  chrome.tabs.onRemoved.addListener((tabId) => {
    delete tabOrigins[tabId]
    unsubscribeTab(tabId)
  })

  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url) {
      const origin = originFromUrl(changeInfo.url)
      const tabOrigin = tabOrigins[tabId]
      if (tabOrigin !== origin) {
        tabOrigins[tabId] = origin
        unsubscribeTab(tabId)
        if (tabId === activeTabId) {
          refreshActiveOriginStatus({ id: tabId, url: changeInfo.url }).catch(console.error)
        }
      }
    }
  })

  async function handleActivatedTab(tabId: number) {
    activeTabId = tabId

    const tab = await chrome.tabs.get(tabId)
    const tabOrigin = getOrigin()
    if (tabOrigin.startsWith('http') || tabOrigin.startsWith('file')) {
      chrome.tabs
        .sendMessage(tabId, { type: 'embedded:action', action: { type: 'getChainId' } })
        .catch(() => {})
    }
    await refreshActiveOriginStatus(tab)
  }

  chrome.tabs.onActivated.addListener(({ tabId }) => {
    handleActivatedTab(tabId).catch(console.error)
  })
}

const CLIENT_STATUS_ALARM_KEY = 'check-client-status'

async function setupClientStatusAlarm() {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === CLIENT_STATUS_ALARM_KEY) {
      connectionReady
        .then(async () => {
          if (retrying) {
            return
          }
          if (provider?.isConnected()) {
            dappConnection?.ensureConnected()
            await provider.checkHealth()
          } else {
            provider?.connection.ensureConnected()
          }
        })
        .catch(console.error)
    }
  })

  const alarm = await chrome.alarms.get(CLIENT_STATUS_ALARM_KEY)
  if (!alarm) {
    await chrome.alarms.create(CLIENT_STATUS_ALARM_KEY, { delayInMinutes: 0, periodInMinutes: 0.5 })
  }
}

// extension reloads orphan content scripts in open tabs (their chrome.runtime dies,
// silently breaking the page <-> background relay). Re-inject into existing tabs so
// users don't have to refresh every tab after a reload. inject.js guards against
// duplicating the page-world provider via a DOM marker.
async function injectExistingTabs() {
  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*', 'file://*/*'] })
  for (const tab of tabs) {
    if (!tab.id) {
      continue
    }
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: ['inject.js']
      })
    } catch (e) {
      // tabs that block injection (web store, restricted pages) — ignore
    }
  }
}

chrome.runtime.onInstalled.addListener(() => {
  injectExistingTabs().catch(console.error)
})

setIcon('icons/icon96moon.png')
setPopup('settings.html')

addStateListeners()
addTabListeners().catch(console.error)
setupClientStatusAlarm().catch(console.error)
const connectionReady = chrome.storage.local.get([PRIMARY_RETRY_KEY, DAPP_RETRY_KEY]).then((saved) => {
  retryStates = {
    [PRIMARY_RETRY_KEY]: saved[PRIMARY_RETRY_KEY],
    [DAPP_RETRY_KEY]: saved[DAPP_RETRY_KEY]
  }
  initProvider()
})
connectionReady.catch(console.error)
