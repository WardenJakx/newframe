/* globals chrome */

import { Button } from '@newframe/ui/button'
import { ChoiceGrid } from '@newframe/ui/choice-grid'
import { Icon } from '@newframe/ui/icon'
import { UIRoot } from '@newframe/ui/root'
import { Stack } from '@newframe/ui/stack'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'
import React, { useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { useStore } from 'zustand'

import { frameStateStore, type FrameState } from '../frameState'
import { SettingsConnectionAction } from './SettingsConnectionAction'
import { SettingsDisclosure } from './SettingsDisclosure'
import { SettingsMessage } from './SettingsMessage'
import { SettingsMode } from './SettingsMode'
import { SettingsPanel } from './SettingsPanel'
import { SettingsStatus } from './SettingsStatus'

const APPEAR_AS_MM = '__newframeAppearAsMM__'
const LEGACY_APPEAR_AS_MM = '__frameAppearAsMM__'

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
  return tabs[0]
}

async function executeScript<Args extends unknown[], Result>(
  tabId: number,
  func: (...args: Args) => Result,
  args: Args
) {
  try {
    return await chrome.scripting.executeScript({
      target: { tabId },
      func,
      args
    })
  } catch (error) {
    // Script injection is unavailable on browser-owned pages such as chrome:// tabs.
    return []
  }
}

async function getLocalSetting(tabId: number, key: string) {
  const keys = key === APPEAR_AS_MM ? [APPEAR_AS_MM, LEGACY_APPEAR_AS_MM] : [key]
  const results = await executeScript(
    tabId,
    (settings: string[]) =>
      settings.map((setting) => localStorage.getItem(setting)).find((value) => value !== null),
    [keys]
  )

  if (results.length > 0) {
    try {
      return JSON.parse(results[0]!.result || 'false')
    } catch (error) {
      return false
    }
  }

  return false
}

async function setLocalSetting(tabId: number, setting: string, value: boolean) {
  return executeScript(
    tabId,
    (key: string, nextValue: boolean) => {
      localStorage.setItem(key, String(nextValue))
      window.location.reload()
    },
    [setting, value] as [string, boolean]
  )
}

async function toggleLocalSetting(key: string) {
  const activeTab = await getActiveTab()

  if (activeTab?.id !== undefined) {
    const currentValue = await getLocalSetting(activeTab.id, key)
    void setLocalSetting(activeTab.id, key, !currentValue)
    window.close()
  }
}

const originDomainRegex = /^(?<protocol>.+:(?:\/\/)?)(?<origin>[^#/]*)/

export function parseOrigin(url = ''): { protocol: string; origin: string } {
  const match = url.match(originDomainRegex)

  if (!match) {
    console.warn(`could not parse origin: ${url}`)
    return { protocol: '', origin: url }
  }

  return {
    protocol: match.groups?.protocol || '',
    origin: match.groups?.origin || url
  }
}

export function shortAddress(address = '') {
  if (!address || address.length <= 14) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

const chainConnected = ({ connected }: { connected?: boolean }) => connected === undefined || connected

const isInjectedUrl = (url = '') => url.startsWith('http') || url.startsWith('file')

interface SettingsProps {
  tab?: chrome.tabs.Tab
  isSupportedTab: boolean
  mmAppear: boolean
}

interface SettingsViewProps extends SettingsProps {
  settings: FrameState
}

interface SettingsViewState {
  connectionDetailsOpen: boolean
}

export class SettingsView extends React.Component<SettingsViewProps, SettingsViewState> {
  override state = {
    connectionDetailsOpen: false
  }

  private notConnected() {
    return (
      <SettingsMessage
        action={{ href: 'https://newframe.sh', label: 'Download Newframe' }}
        detailLines={[
          'Make sure the Newframe desktop app is running',
          'on your machine or download it below'
        ]}
        title='Unable to connect to Newframe'
      />
    )
  }

  private unsupportedTab(origin: string) {
    return (
      <SettingsMessage
        detailLines={['Newframe does not have access to', origin, 'tabs in this browser']}
        emphasizedDetail={1}
        title='Unsupported tab'
      />
    )
  }

  private frameConnected() {
    const isConnected = this.props.settings.connected

    return (
      <Surface padding='small' radius='card' tone='card'>
        <SettingsConnectionAction
          disabled={!isConnected}
          imageSource={isConnected ? 'icons/icon96good.png' : 'icons/icon96moon.png'}
          label={isConnected ? 'Newframe Connected' : 'Newframe Disconnected'}
          onPress={() => chrome.runtime.sendMessage({ method: 'frame_summon', params: [] })}
          tone={isConnected ? 'success' : 'danger'}
        />
      </Surface>
    )
  }

  private appearAsMetamaskToggle() {
    const currentValue = this.props.mmAppear ? 'Metamask' : 'Newframe'
    const toggleValue = this.props.mmAppear ? 'Newframe' : 'Metamask'

    return (
      <SettingsMode
        currentLabel='Injecting as'
        currentTone={this.props.mmAppear ? 'warning' : 'success'}
        currentValue={currentValue}
        onToggle={() => void toggleLocalSetting(APPEAR_AS_MM)}
        toggleLabel='Appear as'
        toggleTone={this.props.mmAppear ? 'success' : 'warning'}
        toggleValue={`${toggleValue} Instead`}
      />
    )
  }

  private siteConnection() {
    const { siteConnected: connected, currentAddress: address } = this.props.settings
    const hasSelectedWallet = Boolean(address)

    return (
      <SettingsStatus
        label={
          connected ? 'Connected wallet' : hasSelectedWallet ? 'Connect in Newframe' : 'No wallet selected'
        }
        tone={connected || hasSelectedWallet ? 'success' : 'danger'}
        value={hasSelectedWallet ? shortAddress(address) : 'Open Newframe to select a wallet'}
      />
    )
  }

  private connectionDisclosure() {
    const detailsOpen = this.state.connectionDetailsOpen

    return (
      <SettingsDisclosure
        description={detailsOpen ? 'Hide connection actions' : 'Network and connection'}
        expanded={detailsOpen}
        onPress={() => this.setState({ connectionDetailsOpen: !detailsOpen })}
        title={this.currentChain()}
      />
    )
  }

  private disconnectButton() {
    if (!this.props.settings.siteConnected) return null

    return (
      <Button
        appearance='danger'
        onPress={() =>
          chrome.runtime.sendMessage({
            tab: this.props.tab,
            method: 'frame_disconnect_current_site'
          })
        }
        size='large'
      >
        <Text align='center' role='action' tone='danger'>
          Disconnect this site
        </Text>
      </Button>
    )
  }

  private chainSelect() {
    const { availableChains, currentChain } = this.props.settings
    const { tab } = this.props

    if (!tab) return null

    return (
      <ChoiceGrid
        label='Network'
        onSelect={(chainId) => {
          const chain = availableChains.find((candidate) => String(candidate.chainId) === chainId)
          if (!chain || !chainConnected(chain)) return

          chrome.runtime.sendMessage({
            tab,
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: chain.chainId }]
          })
          updateCurrentChain(tab)
        }}
        options={availableChains.map((chain) => ({
          disabled: !chainConnected(chain),
          id: String(chain.chainId),
          label: chain.name || String(chain.chainId),
          selected: Number(chain.chainId) === Number.parseInt(currentChain, 16)
        }))}
      />
    )
  }

  private currentChain() {
    try {
      const { availableChains, currentChain } = this.props.settings
      const currentChainId = Number.parseInt(currentChain, 16)
      const currentChainDetails = availableChains.find(({ chainId }) => Number(chainId) === currentChainId)

      if (currentChainDetails?.name) return currentChainDetails.name

      const chainInteger = Number.parseInt(currentChain)
      return Number.isNaN(chainInteger) ? '?' : chainInteger
    } catch (error) {
      return '?'
    }
  }

  private renderMainPanel() {
    const isConnected = this.props.settings.connected
    const { tab, isSupportedTab } = this.props
    const { protocol, origin } = parseOrigin(tab?.url)

    if (!isConnected) {
      return this.notConnected()
    }

    if (!isSupportedTab) {
      return this.unsupportedTab(protocol + origin)
    }

    const detailsOpen = this.state.connectionDetailsOpen

    return (
      <Surface border='subtle' elevation='default' padding='medium' radius='card' tone='secondary'>
        <Stack gap='medium'>
          <Stack align='center' direction='row' gap='small' justify='center'>
            <Icon name='window' size='small' />
            <Text role='heading'>{origin}</Text>
          </Stack>
          <Stack gap='xsmall'>
            {this.siteConnection()}
            {this.connectionDisclosure()}
            {detailsOpen && this.props.settings.availableChains.length > 0 ? this.chainSelect() : null}
            {detailsOpen ? this.disconnectButton() : null}
            {this.appearAsMetamaskToggle()}
          </Stack>
        </Stack>
      </Surface>
    )
  }

  override render() {
    return (
      <SettingsPanel>
        {this.frameConnected()}
        {this.renderMainPanel()}
      </SettingsPanel>
    )
  }
}

function Settings(props: SettingsProps) {
  const settings = useStore(frameStateStore)

  useEffect(() => {
    const frameConnect = chrome.runtime.connect({ name: 'frame_connect' })
    const updateSettings = (state: FrameState) => frameStateStore.setState(state, true)

    frameConnect.onMessage.addListener(updateSettings)

    return () => {
      frameConnect.onMessage.removeListener(updateSettings)
      frameConnect.disconnect()
    }
  }, [])

  return <SettingsView {...props} settings={settings} />
}

function updateCurrentChain(tab: chrome.tabs.Tab) {
  chrome.tabs.sendMessage(tab.id!, {
    type: 'embedded:action',
    action: { type: 'getChainId' }
  })
}

async function getInitialSettings(tabId: number) {
  return getLocalSetting(tabId, APPEAR_AS_MM)
}

document.addEventListener('DOMContentLoaded', async () => {
  console.info('Settings panel loaded')

  const activeTab = await getActiveTab()
  const isInjectedTab = isInjectedUrl(activeTab?.url)
  const mmAppear = isInjectedTab ? await getInitialSettings(activeTab!.id!) : false

  if (isInjectedTab) {
    chrome.runtime.sendMessage({ tab: activeTab, method: 'frame_refresh_origin_status' })

    setInterval(() => {
      updateCurrentChain(activeTab!)
      chrome.runtime.sendMessage({ tab: activeTab, method: 'frame_refresh_origin_status' })
    }, 1000)
  }

  console.debug('Initial settings', { activeTab, isInjectedTab, mmAppear })

  const root = document.getElementById('root')
  createRoot(root!).render(
    <UIRoot>
      <Settings tab={activeTab} isSupportedTab={isInjectedTab} mmAppear={mmAppear} />
    </UIRoot>
  )
})
