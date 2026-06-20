/* globals chrome */
import FrameBackgroundProvider from './frameConnection'

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
let settingsPanel: chrome.runtime.Port | null, activeTabId: number

interface PendingRequest {
  tabId: number
  payloadId: number
  method: string
  params: any
  origin: string
}

interface Subscription {
  tabId: number
  send: (subload: any) => void
  type: string
}

const subs: Record<string, Subscription> = {}
const pending: Record<string, PendingRequest> = {}

interface FrameState {
  connected: boolean
  availableChains: any[]
  currentChain: string
  activeOrigin: string
  siteConnected: boolean
  currentAddress: string
}

const frameState: FrameState = {
  connected: false,
  availableChains: [],
  currentChain: '',
  activeOrigin: '',
  siteConnected: false,
  currentAddress: ''
}

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
  if (!url) return ''
  const path = url.split('/')
  return `${path[0]}//${path[2]}`
}
const getOrigin = (sender: any = {}) => originFromUrl(sender.url)
const isInjectedUrl = (url = '') => url.startsWith('http') || url.startsWith('file')

const subType = (pendingPayload: PendingRequest) => {
  try {
    const type = pendingPayload.params[0]
    return subTypes.includes(type) ? type : 'unknown'
  } catch (e) {
    return 'unknown'
  }
}

const unsubscribeTab = (tabId: number) => {
  Object.keys(pending).forEach((id) => {
    if (pending[id]!.tabId === tabId) delete pending[id]
  })
  Object.keys(subs).forEach((sub) => {
    if (subs[sub]!.tabId === tabId) {
      provider!.request({ method: 'eth_unsubscribe', params: [sub] }).catch(() => {})
      delete subs[sub]
    }
  })
}

function updateSettingsPanel() {
  if (settingsPanel) {
    settingsPanel.postMessage(frameState)
  }
}

function setConnected(connected: boolean) {
  console.debug(`Setting connected to ${connected}`)

  frameState.connected = connected
  updateSettingsPanel()
}

function setChains(chains: any[]) {
  console.debug('Setting available chains', { chains })

  frameState.availableChains = chains
  updateSettingsPanel()
}

function setCurrentChain(chain: string) {
  console.debug(`Setting current chain to ${chain}`)

  frameState.currentChain = chain
  updateSettingsPanel()
}

function setOriginStatus(origin: string, siteConnected: boolean, currentAddress = '') {
  console.debug('Setting origin status', { origin, siteConnected, currentAddress })

  frameState.activeOrigin = origin
  frameState.siteConnected = siteConnected
  frameState.currentAddress = currentAddress
  updateSettingsPanel()
}

function setIcon(path: string) {
  chrome.action.setIcon({ path })
}

function setPopup(popup: string) {
  chrome.action.setPopup({ popup })
}

async function fetchAvailableChains() {
  try {
    const chains = await provider!.request<any[]>({ method: 'wallet_getEthereumChains' })
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

async function refreshActiveOriginStatus(tab?: chrome.tabs.Tab) {
  const activeTab = tab || (await getActiveTab())
  const origin = originFromUrl(activeTab?.url)

  if (!activeTab?.id || !isInjectedUrl(activeTab.url || '') || !origin) {
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
      __extensionConnecting: true,
      __frameInternal: true
    })

    setOriginStatus(status.origin || origin, status.connected, status.address || status.selectedAddress || '')
    if (status.chainId) setCurrentChain(status.chainId)
  } catch (e) {
    console.error('Error fetching origin status', e)
    setOriginStatus(origin, false, '')
  }
}

async function disconnectActiveOrigin(tab?: chrome.tabs.Tab) {
  const activeTab = tab || (await getActiveTab())
  const origin = originFromUrl(activeTab?.url)

  if (!activeTab?.id || !isInjectedUrl(activeTab.url || '') || !origin || !provider?.isConnected()) {
    return
  }

  try {
    const status = await provider.request<OriginStatus>({
      method: 'frame_disconnectOrigin',
      __frameOrigin: origin,
      __extensionConnecting: true,
      __frameInternal: true
    })

    setOriginStatus(status.origin || origin, false, '')
  } catch (e) {
    console.error('Error disconnecting origin', e)
    await refreshActiveOriginStatus(activeTab)
  }
}

async function sendEventToTab(tabId: number, event: string, args?: any) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: 'eth:event', event, args })
  } catch (e) {
    // tabs without our content script (chrome:// pages, stale tabs) can't receive — expected
    if ((e as Error)?.message?.includes('Receiving end does not exist')) return
    console.error(`Error sending event "${event}"`, e)
  }
}

async function sendEvent(event: string, args: any[] = [], selector: chrome.tabs.QueryInfo = {}) {
  const tabs = await chrome.tabs.query(selector)

  tabs.filter((tab) => !!tab.url).forEach((tab) => sendEventToTab(tab.id!, event, args))
}

function initProvider() {
  console.log('Initializing provider connection to Newframe')

  provider = new FrameBackgroundProvider('ws://127.0.0.1:1248?identity=newframe-extension')

  provider.on('connect', async () => {
    console.log('Connected to Newframe')

    setConnected(true)
    fetchAvailableChains()
    refreshActiveOriginStatus()

    setIcon('icons/icon96good.png')
    sendEvent('connect')
  })

  provider.on('disconnect', () => {
    setConnected(false)
    setOriginStatus(frameState.activeOrigin, false, '')

    setIcon('icons/icon96moon.png')
    sendEvent('close')
  })

  provider.on('chainsChanged', (chains = []) => {
    if (chains[0] && typeof chains[0] === 'object') {
      setChains(chains)
    }
  })

  provider.on('accountsChanged', () => {
    refreshActiveOriginStatus()
  })

  provider.connection.on('payload', async (payload: any) => {
    if (typeof payload.id !== 'undefined') {
      if (pending[payload.id]) {
        const { tabId, payloadId } = pending[payload.id]!
        if (pending[payload.id]!.method === 'eth_subscribe' && payload.result) {
          subs[payload.result] = {
            tabId,
            send: (subload) => chrome.tabs.sendMessage(tabId, subload).catch(() => {}),
            type: subType(pending[payload.id]!)
          }
        } else if (pending[payload.id]!.method === 'eth_unsubscribe') {
          const params: any[] = payload.params ? [].concat(payload.params) : []
          params.forEach((sub) => delete subs[sub])
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
            if (chainId) setCurrentChain(chainId)
          }
        }

        delete pending[payload.id]
      }
    } else if (
      payload.method &&
      payload.method.indexOf('_subscription') > -1 &&
      subs[payload.params.subscription]
    ) {
      // Emit subscription result to tab
      const sub = subs[payload.params.subscription]!
      payload.type = 'eth:payload'
      sub.send(payload)
      if (sub.type === 'chainChanged' && sub.tabId === activeTabId) {
        const chainId = payload.params?.result
        if (chainId) setCurrentChain(chainId)
      }
    }
  })
}

function destroyProvider() {
  if (provider) {
    provider.close!()
    provider = null
  }
}

function addStateListeners() {
  function onPortDisconnected(port: chrome.runtime.Port) {
    settingsPanel = null
    port.onDisconnect.removeListener(onPortDisconnected)
  }

  function setMediaBlob(blobUrl: string, location: any, message?: string) {
    ;(window as any).__setMediaBlob__(blobUrl, location, message)
  }

  chrome.runtime.onMessage.addListener(async (extensionPayload, sender) => {
    const { tab, ...payload } = extensionPayload
    const { method, params } = payload

    console.debug('Message received from tab', { tab, payload })

    if (payload.method === 'embedded_action_res') {
      const [action, res] = params
      if (action.type === 'getChainId' && res.chainId) return setCurrentChain(res.chainId)
    } else if (payload.method === 'media_blob') {
      const location = payload.location

      try {
        const res = await fetch(payload.src)
        const blob = await res.blob()
        const blobURL = URL.createObjectURL(blob)

        chrome.scripting.executeScript({
          target: { tabId: sender.tab!.id! },
          func: setMediaBlob,
          args: [blobURL, location]
        })
      } catch (e) {
        chrome.scripting.executeScript({
          target: { tabId: sender.tab!.id! },
          func: setMediaBlob,
          args: ['', location, (e as Error).message]
        })
      }
    }

    if (payload.method === 'frame_disconnect_current_site') {
      if (sender.tab) return

      await disconnectActiveOrigin(tab)
      return
    }

    if (payload.method === 'frame_refresh_origin_status') {
      if (sender.tab) return

      await refreshActiveOriginStatus(tab)
      return
    }

    if (payload.method === 'frame_summon')
      return provider!.connection.send({ jsonrpc: '2.0', id: 1, method, params })

    const id = provider!.nextId++
    const origin = getOrigin(tab || sender)
    if (!origin) return console.error('No origin found for sender')
    pending[id] = {
      tabId: sender?.tab?.id || tab.id,
      payloadId: payload.id,
      method,
      params,
      origin
    }

    const load = {
      ...payload,
      jsonrpc: '2.0',
      id,
      __frameOrigin: origin,
      __extensionConnecting: payload.__extensionConnecting,
      __frameInternal: undefined
    }

    provider!.connection.send(load)
  })

  chrome.runtime.onConnect.addListener((port) => {
    port.onDisconnect.addListener(onPortDisconnected)

    if (port.name === 'frame_connect') {
      settingsPanel = port
      updateSettingsPanel()
      refreshActiveOriginStatus()
    }
  })

  chrome.idle.onStateChanged.addListener((state) => {
    if (state === 'active') {
      destroyProvider()
      initProvider()
    }
  })
}

async function addTabListeners() {
  // Query for all existing tabs and store their origins
  const tabs = await chrome.tabs.query({})
  const activeTab = tabs.find((tab) => tab.active)

  if (activeTab?.id) {
    activeTabId = activeTab.id
    refreshActiveOriginStatus(activeTab)
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
        if (tabId === activeTabId)
          refreshActiveOriginStatus({ id: tabId, url: changeInfo.url } as chrome.tabs.Tab)
      }
    }
  })

  chrome.tabs.onActivated.addListener(async ({ tabId }) => {
    activeTabId = tabId

    const tab = await chrome.tabs.get(tabId)
    const tabOrigin = getOrigin(tab.url)
    if (tabOrigin.startsWith('http') || tabOrigin.startsWith('file')) {
      chrome.tabs
        .sendMessage(tabId, { type: 'embedded:action', action: { type: 'getChainId' } })
        .catch(() => {})
    }
    refreshActiveOriginStatus(tab)
  })
}

const CLIENT_STATUS_ALARM_KEY = 'check-client-status'

async function setupClientStatusAlarm() {
  const alarm = await chrome.alarms.get(CLIENT_STATUS_ALARM_KEY)

  if (!alarm) {
    await chrome.alarms.create(CLIENT_STATUS_ALARM_KEY, { delayInMinutes: 0, periodInMinutes: 0.5 })
  }

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === CLIENT_STATUS_ALARM_KEY) {
      if (provider && provider.isConnected()) {
        provider.request({ jsonrpc: '2.0', id: 1, method: 'web3_clientVersion' } as any)
      }
    }
  })
}

// extension reloads orphan content scripts in open tabs (their chrome.runtime dies,
// silently breaking the page <-> background relay). Re-inject into existing tabs so
// users don't have to refresh every tab after a reload. inject.js guards against
// duplicating the page-world provider via a DOM marker.
chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*', 'file://*/*'] })
  for (const tab of tabs) {
    if (!tab.id) continue
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: ['inject.js']
      })
    } catch (e) {
      // tabs that block injection (web store, restricted pages) — ignore
    }
  }
})

setIcon('icons/icon96moon.png')
setPopup('settings.html')

addStateListeners()
addTabListeners()
setupClientStatusAlarm()
initProvider()
