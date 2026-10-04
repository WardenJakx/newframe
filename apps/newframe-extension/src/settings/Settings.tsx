import { useEffect } from 'react'
import { useStore } from 'zustand'

import { frameStateStore, type FrameState } from '../frameState.ts'
import { SettingsView } from './SettingsView.tsx'
import {
  isSupportedTab,
  refreshCurrentChain,
  switchOriginChain,
  toggleMetaMaskSetting
} from './tabSettings.ts'

export function Settings({ tab, mmAppear }: { tab?: chrome.tabs.Tab; mmAppear: boolean }) {
  const settings = useStore(frameStateStore)
  const supported = isSupportedTab(tab)

  useEffect(() => {
    const port = chrome.runtime.connect({ name: 'newframe_connect' })
    const updateSettings = (state: FrameState) => frameStateStore.setState(state, true)
    port.onMessage.addListener(updateSettings)
    return () => {
      port.onMessage.removeListener(updateSettings)
      port.disconnect()
    }
  }, [])

  useEffect(() => {
    if (!supported || tab?.id === undefined) {
      return
    }
    const tabId = tab.id
    const refresh = () => {
      void refreshCurrentChain(tabId)
      void chrome.runtime.sendMessage({ tab, method: 'newframe_refresh_dapp_status' })
    }
    void chrome.runtime.sendMessage({ method: 'newframe_refresh_chains' })
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
      onSummon={() => void chrome.runtime.sendMessage({ method: 'newframe_summon', params: [] })}
      onRetryConnection={() => void chrome.runtime.sendMessage({ method: 'newframe_retry_connection' })}
      onDisconnect={() =>
        void chrome.runtime.sendMessage({ tab, method: 'newframe_disconnect_current_dapp' })
      }
      onToggleMetaMask={() => {
        if (tab?.id !== undefined) {
          void toggleMetaMaskSetting(tab.id).catch(console.error)
        }
      }}
      onSelectAccount={(address) =>
        void chrome.runtime.sendMessage({ tab, method: 'newframe_select_account', params: [address] })
      }
      onRequestAccounts={() => void chrome.runtime.sendMessage({ tab, method: 'newframe_request_accounts' })}
      onSelectChain={(chainId) => {
        const chain = settings.availableChains.find((candidate) => String(candidate.chainId) === chainId)
        if (!tab || !chain || chain.connected === false) {
          return
        }
        void switchOriginChain(tab, chain.chainId).catch(console.error)
      }}
    />
  )
}
