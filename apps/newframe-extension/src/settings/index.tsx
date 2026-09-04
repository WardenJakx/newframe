/* globals chrome */

import { Button } from '@newframe/ui/button'
import { Icon } from '@newframe/ui/icon'
import { Image } from '@newframe/ui/image'
import { Inline } from '@newframe/ui/inline'
import { MediaIcon } from '@newframe/ui/media-icon'
import { UIRoot } from '@newframe/ui/root'
import { Stack } from '@newframe/ui/stack'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'
import { ToggleButton } from '@newframe/ui/toggle-button'
import React, { useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { useStore } from 'zustand'

import { frameStateStore, type FrameState } from '../frameState'
import { frameConnectionPresentation, siteConnectionPresentation } from './connectionPresentation'
import { NetworkSelector } from './NetworkSelector'
import { SettingsMessage } from './SettingsMessage'
import { SettingsPanel } from './SettingsPanel'
import { parseOrigin } from './siteOrigin'
import '../styled-system/styles.css'

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

export class SettingsView extends React.Component<SettingsViewProps> {
  private desktopUnavailable() {
    return (
      <SettingsMessage
        action={{ href: 'https://newframe.sh', label: 'Download Newframe' }}
        detail='Open the Newframe desktop app on this machine to continue.'
        title='Newframe desktop app not found'
      />
    )
  }

  private extensionApprovalPending() {
    return (
      <SettingsMessage
        detail='Newframe is open. Approve this extension in the desktop app.'
        title='Approve the browser extension'
      />
    )
  }

  private unsupportedTab(origin: string) {
    return (
      <SettingsMessage
        detail={`Newframe cannot run on ${origin} pages in this browser.`}
        title='Unsupported tab'
      />
    )
  }

  private frameConnected() {
    const { connectionStatus } = this.props.settings
    const presentation = frameConnectionPresentation(connectionStatus)

    return (
      <Surface border='subtle' padding='xsmall' radius='control' tone='card'>
        <Button
          appearance='ghost'
          disabled={!presentation.connected}
          label={presentation.label}
          onPress={() => chrome.runtime.sendMessage({ method: 'frame_summon', params: [] })}
          size='large'
          width='full'
        >
          <Image
            alt=''
            size='medium'
            source={presentation.connected ? 'icons/icon96good.png' : 'icons/icon96moon.png'}
          />
          <Stack gap='none' grow>
            <Text variant='label' tone={presentation.tone} truncate>
              {presentation.label}
            </Text>
            <Text variant='caption' tone='muted'>
              Desktop app
            </Text>
          </Stack>
          <Icon name='arrowRight' size='small' tone='secondary' />
        </Button>
      </Surface>
    )
  }

  private appearAsMetamaskToggle() {
    return (
      <Surface padding='small' radius='control' tone='raised'>
        <Inline align='center' gap='small' justify='between'>
          <Stack gap='xsmall' grow>
            <Text variant='label'>Appear as MetaMask</Text>
            <Text variant='caption' tone='muted'>
              Sites currently see {this.props.mmAppear ? 'MetaMask' : 'Newframe'}
            </Text>
          </Stack>
          <ToggleButton
            appearance='switch'
            label='Appear as MetaMask'
            onPress={() => void toggleLocalSetting(APPEAR_AS_MM)}
            pressed={this.props.mmAppear}
          />
        </Inline>
      </Surface>
    )
  }

  private siteConnection(origin: string) {
    const { siteConnected: connected, currentAddress: address } = this.props.settings
    const presentation = siteConnectionPresentation(connected, address)

    return (
      <Inline align='center' gap='small' grow>
        <MediaIcon source={this.props.tab?.favIconUrl} />
        <Stack gap='none' grow>
          <Text truncate variant='label'>
            {origin}
          </Text>
          <Inline align='center' gap='xsmall'>
            <Text tone={presentation.tone} variant='caption'>
              {connected ? 'Connected' : presentation.label}
            </Text>
            {connected ? (
              <Button
                appearance='ghost'
                content='icon'
                label='Disconnect this site'
                onPress={() =>
                  chrome.runtime.sendMessage({
                    tab: this.props.tab,
                    method: 'frame_disconnect_current_site'
                  })
                }
                shape='pill'
                size='compact'
              >
                <Icon name='unlink' size='small' />
              </Button>
            ) : null}
          </Inline>
        </Stack>
      </Inline>
    )
  }

  private chainSelect() {
    const { availableChains, currentChain } = this.props.settings
    const { tab } = this.props

    if (!tab) return null

    return (
      <NetworkSelector
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
          iconUrl: chain.icon?.[0]?.url,
          id: String(chain.chainId),
          label: chain.name || String(chain.chainId),
          selected: Number(chain.chainId) === Number.parseInt(currentChain, 16)
        }))}
      />
    )
  }

  private renderMainPanel() {
    const { connectionStatus } = this.props.settings
    const { tab, isSupportedTab } = this.props
    const { protocol, origin } = parseOrigin(tab?.url)

    if (connectionStatus === 'desktop-unavailable') return this.desktopUnavailable()
    if (connectionStatus === 'extension-approval-pending') return this.extensionApprovalPending()

    if (!isSupportedTab) {
      return this.unsupportedTab(protocol + origin)
    }

    return (
      <Stack gap='small'>
        <Surface border='subtle' elevation='default' padding='small' radius='card' tone='card'>
          <Inline align='center' gap='small' justify='between'>
            {this.siteConnection(origin)}
            {this.props.settings.availableChains.length > 0 ? this.chainSelect() : null}
          </Inline>
        </Surface>
        {this.appearAsMetamaskToggle()}
      </Stack>
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
    chrome.runtime.sendMessage({ method: 'frame_refresh_chains' })
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
