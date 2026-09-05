import { useEffect } from 'react'
import { useStore } from 'zustand'

import { frameStateStore, type FrameState } from '../frameState'
import { SettingsView } from './SettingsView'
import { isSupportedTab, refreshCurrentChain, toggleMetaMaskSetting } from './tabSettings'

export function Settings({ tab, mmAppear }: { tab?: chrome.tabs.Tab; mmAppear: boolean }) {
  const settings = useStore(frameStateStore)
  const supported = isSupportedTab(tab)

  useEffect(() => {
    const port = chrome.runtime.connect({ name: 'frame_connect' })
    const updateSettings = (state: FrameState) => frameStateStore.setState(state, true)
    port.onMessage.addListener(updateSettings)
    return () => {
      port.onMessage.removeListener(updateSettings)
      port.disconnect()
    }
  }, [])

  useEffect(() => {
    if (!supported || tab?.id === undefined) return
    const tabId = tab.id
    const refresh = () => {
      void refreshCurrentChain(tabId)
      void chrome.runtime.sendMessage({ tab, method: 'frame_refresh_origin_status' })
    }
    void chrome.runtime.sendMessage({ method: 'frame_refresh_chains' })
    refresh()
    const interval = setInterval(refresh, 1000)
    return () => clearInterval(interval)
  }, [supported, tab])

  return (
    <SettingsView
      tab={tab}
      isSupportedTab={supported}
      mmAppear={mmAppear}
      settings={settings}
      onSummon={() => void chrome.runtime.sendMessage({ method: 'frame_summon', params: [] })}
      onDisconnect={() => void chrome.runtime.sendMessage({ tab, method: 'frame_disconnect_current_site' })}
      onToggleMetaMask={() => {
        if (tab?.id !== undefined) {
          void toggleMetaMaskSetting(tab.id).catch(console.error)
        }
      }}
      onSelectChain={(chainId) => {
        const chain = settings.availableChains.find((candidate) => String(candidate.chainId) === chainId)
        if (!tab || !chain || chain.connected === false) return
        void chrome.runtime.sendMessage({
          tab,
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: chain.chainId }]
        })
      }}
    />
  )
}
