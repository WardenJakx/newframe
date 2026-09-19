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
  payloadId?: number | string
  method: string
  params: readonly unknown[]
  origin: string
}

interface Subscription {
  tabId: number
  send: (subload: JsonRpcResponse & { type: 'eth:payload' }) => void
  type: string
}

const subs: Record<string, Subscription> = {}
const pending: Record<string, PendingRequest> = {}

interface OriginStatus {
  origin?: string
  connected: boolean
  address?: string
  selectedAddress?: string
  chainId?: string
}

interface TabInfo {
  id?: number
  url?: string
}

declare global {
  interface Window {
    __setMediaBlob__?: (blobUrl: string, location: unknown, message?: string) => void
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value)
}

function isJsonRpcId(value: unknown): value is number | string {
  return typeof value === 'number' || typeof value === 'string'
}

function isJsonRpcPayload(value: unknown): value is JsonRpcPayload {
  return (
    isRecord(value) &&
    typeof value.method === 'string' &&
    (value.id === undefined || isJsonRpcId(value.id)) &&
    (value.jsonrpc === undefined || value.jsonrpc === '2.0') &&
    (value.params === undefined || isUnknownArray(value.params)) &&
    (value.chainId === undefined || typeof value.chainId === 'string') &&
    (value.__extensionConnecting === undefined || typeof value.__extensionConnecting === 'boolean')
  )
}

function isSubscriptionParams(
  value: JsonRpcResponse['params']
): value is { subscription: string; result: unknown } {
  return isRecord(value) && typeof value.subscription === 'string' && 'result' in value
}

function isAvailableChain(value: unknown): value is AvailableChain {
  if (!isRecord(value) || (typeof value.chainId !== 'number' && typeof value.chainId !== 'string')) {
    return false
  }

  return (
    (value.name === undefined || typeof value.name === 'string') &&
    (value.connected === undefined || typeof value.connected === 'boolean') &&
    (value.icon === undefined ||
      (Array.isArray(value.icon) &&
        value.icon.every((icon: unknown) => isRecord(icon) && typeof icon.url === 'string')))
  )
}

function isAvailableChains(value: unknown): value is AvailableChain[] {
  return Array.isArray(value) && value.every(isAvailableChain)
}

function isOriginStatus(value: unknown): value is OriginStatus {
  return (
    isRecord(value) &&
    typeof value.connected === 'boolean' &&
    (value.origin === undefined || typeof value.origin === 'string') &&
    (value.address === undefined || typeof value.address === 'string') &&
    (value.selectedAddress === undefined || typeof value.selectedAddress === 'string') &&
    (value.chainId === undefined || typeof value.chainId === 'string')
  )
}

function tabInfo(value: unknown): TabInfo | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const id = typeof value.id === 'number' ? value.id : undefined
  const url = typeof value.url === 'string' ? value.url : undefined
  return id === undefined && url === undefined ? undefined : { id, url }
}

// helper functions
const originFromUrl = (url?: string) => {
  if (!url) {
    return ''
  }
  const path = url.split('/')
  return `${path[0]}//${path[2]}`
}
const isInjectedUrl = (url = '') => url.startsWith('http') || url.startsWith('file')

const subType = (pendingPayload: PendingRequest) => {
  try {
    const type = pendingPayload.params[0]
    return typeof type === 'string' && subTypes.includes(type) ? type : 'unknown'
  } catch (e) {
    return 'unknown'
  }
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
    const chains = await provider.request({ method: 'wallet_getEthereumChains' })
    if (!isAvailableChains(chains)) {
      throw new Error('Invalid available chains response')
    }
    setChains(chains)
  } catch (e) {
    console.error('Error fetching chains', e)
    setChains([])
  }
}

async function getActiveTab() {
  if (activeTabId) {
    try {
      return await chrome.tabs.get(activeTabId)
    } catch (e) {
      // fall through to querying the active tab
    }
  }

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
  return tabs[0]
}

async function refreshActiveOriginStatus(tab?: TabInfo) {
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
    const status = await provider.request({
      method: 'frame_getOriginStatus',
      __frameOrigin: origin,
      __extensionConnecting: true
    })
    if (!isOriginStatus(status)) {
      throw new Error('Invalid origin status response')
    }

    const responseOrigin = status.origin?.length ? status.origin : origin
    const responseAddress = status.address?.length ? status.address : (status.selectedAddress ?? '')
    setOriginStatus(responseOrigin, status.connected, responseAddress)
    if (status.chainId) {
      setCurrentChain(status.chainId)
    }
  } catch (e) {
    console.error('Error fetching origin status', e)
    setOriginStatus(origin, false, '')
  }
}

async function disconnectActiveOrigin(tab?: TabInfo) {
  const activeTab = tab ?? (await getActiveTab())
  const origin = originFromUrl(activeTab?.url)

  if (!activeTab?.id || !isInjectedUrl(activeTab.url ?? '') || !origin || !provider?.isConnected()) {
    return
  }

  try {
    const status = await provider.request({
      method: 'frame_disconnectOrigin',
      __frameOrigin: origin,
      __extensionConnecting: true
    })
    if (!isOriginStatus(status)) {
      throw new Error('Invalid origin status response')
    }

    const responseOrigin = status.origin?.length ? status.origin : origin
    setOriginStatus(responseOrigin, false, '')
  } catch (e) {
    console.error('Error disconnecting origin', e)
    await refreshActiveOriginStatus(activeTab)
  }
}

async function sendEventToTab(tabId: number, event: string, args?: unknown) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: 'eth:event', event, args })
  } catch (e) {
    // tabs without our content script (chrome:// pages, stale tabs) can't receive — expected
    if ((e as Error)?.message?.includes('Receiving end does not exist')) {
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

  provider.on('chainsChanged', (chains: unknown) => {
    if (isAvailableChains(chains) && chains.length > 0) {
      setChains(chains)
    }
  })

  provider.on('accountsChanged', () => {
    refreshActiveOriginStatus().catch(console.error)
  })

  async function handleDappPayload(payload: JsonRpcResponse) {
    if (typeof payload.id !== 'undefined') {
      const request = pending[payload.id]
      if (request) {
        const { tabId, payloadId } = request
        if (request.method === 'eth_subscribe' && typeof payload.result === 'string') {
          subs[payload.result] = {
            tabId,
            send: (subload) => {
              chrome.tabs.sendMessage(tabId, subload).catch((error: unknown) => {
                if ((error as Error)?.message?.includes('Receiving end does not exist')) {
                  return
                }
                console.error('Error sending subscription payload', error)
              })
            },
            type: subType(request)
          }
        } else if (request.method === 'eth_unsubscribe' && Array.isArray(payload.params)) {
          payload.params.forEach((sub: unknown) => {
            if (typeof sub === 'string') {
              delete subs[sub]
            }
          })
        }
        chrome.tabs
          .sendMessage(tabId, Object.assign({}, payload, { id: payloadId, type: 'eth:payload' }))
          .catch(() => {})
        if (request.method === 'eth_chainId' && request.tabId === activeTabId) {
          const payloadOrigin = request.origin
          const activeTab = await chrome.tabs.get(activeTabId)
          const activeTabOrigin = originFromUrl(activeTab.url)
          if (activeTabOrigin === payloadOrigin) {
            if (typeof payload.result === 'string') {
              setCurrentChain(payload.result)
            }
          }
        }

        delete pending[payload.id]
      }
    } else if (
      payload.method?.includes('_subscription') &&
      isSubscriptionParams(payload.params) &&
      subs[payload.params.subscription]
    ) {
      // Emit subscription result to tab
      const sub = subs[payload.params.subscription]!
      sub.send({ ...payload, type: 'eth:payload' })
      if (sub.type === 'chainChanged' && sub.tabId === activeTabId) {
        if (typeof payload.params.result === 'string') {
          setCurrentChain(payload.params.result)
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
    window.__setMediaBlob__?.(blobUrl, location, message)
  }

  async function handleMessage(extensionPayload: unknown, sender: chrome.runtime.MessageSender) {
    await connectionReady
    if (!isJsonRpcPayload(extensionPayload)) {
      return
    }

    const tab = isRecord(extensionPayload) ? tabInfo(extensionPayload.tab) : undefined
    const payload = extensionPayload
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
      return
    } else if (payload.method === 'media_blob') {
      if (!isRecord(extensionPayload) || typeof extensionPayload.src !== 'string') {
        return
      }
      const location = extensionPayload.location
      const tabId = sender.tab?.id
      if (tabId === undefined) {
        return
      }

      try {
        const res = await fetch(extensionPayload.src)
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
    const origin = originFromUrl(tab?.url ?? sender.url)
    if (!origin) {
      return console.error('No origin found for sender')
    }
    const tabId = sender.tab?.id ?? tab?.id
    if (tabId === undefined) {
      return
    }
    pending[id] = {
      tabId,
      payloadId: payload.id,
      method,
      params,
      origin
    }

    const load: JsonRpcPayload = {
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
  const tabOrigins = Object.fromEntries(tabs.map((tab) => [tab.id, originFromUrl(tab.url)]))

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
    const tabOrigin = originFromUrl(tab.url)
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
  retryStates = saved
  initProvider()
})
connectionReady.catch(console.error)
