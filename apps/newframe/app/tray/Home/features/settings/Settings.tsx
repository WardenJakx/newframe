import React, { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import link from '../../../../../resources/link'
import {
  createWebAuthnBiometricCredential,
  isBiometricUserCanceledError,
  isWebAuthnBiometricsSupported
} from '../../../../../resources/biometrics'
import { useWalletSelector } from '../../../../state/useAppSelector'
import { useHomeUiStore } from '../../state/HomeUiProvider'
import { SettingsView } from './SettingsView'
import { useSettingsDrafts } from './useSettingsDrafts'

function operationError(result: any, fallback: string) {
  return result && 'message' in result && typeof result.message === 'string' ? result.message : fallback
}

export function Settings() {
  const shared = useWalletSelector(
    useShallow((state) => ({
      autoDiscoverTokens: !!state.autoDiscoverTokens,
      autohide: !!state.autohide,
      biometricUnlock: !!state.biometricUnlock,
      latticeAccountLimit: state.latticeSettings?.accountLimit,
      latticeDerivation: state.latticeSettings?.derivation,
      latticeEndpoint: state.latticeSettings?.endpointCustom || '',
      latticeEndpointMode: state.latticeSettings?.endpointMode || 'default',
      launch: !!state.launch,
      ledgerDerivation: state.ledger?.derivation,
      liveAccountLimit: state.ledger?.liveAccountLimit,
      menubarGasPrice: !!state.menubarGasPrice,
      networks: state.networks?.ethereum || {},
      platform: state.platform || '',
      portfolioApiKey: state.portfolioApiKey || '',
      reveal: !!state.reveal,
      showLocalNameWithENS: !!state.showLocalNameWithENS,
      showTestnets: !!state.showTestnets,
      summonShortcut: state.shortcuts?.summon,
      trezorDerivation: state.trezor?.derivation
    }))
  )
  const openOverlay = useHomeUiStore((state) => state.openOverlay)
  const selectedChainId = useHomeUiStore((state) => state.selectedChainId)
  const setSelectedChainId = useHomeUiStore((state) => state.setSelectedChainId)
  const [biometricsBusy, setBiometricsBusy] = useState(false)
  const [biometricsError, setBiometricsError] = useState('')
  const persist = (setting: string, value: any) => {
    if (setting === 'auto-discover-tokens' && typeof value === 'object') {
      void link.executeCommand({
        type: 'settings.update',
        setting: 'auto-discover-tokens',
        value: true,
        apiKey: value.apiKey
      })
    } else {
      void link.executeCommand({ type: 'settings.update', setting, value } as any)
    }
  }
  const drafts = useSettingsDrafts({
    initialLatticeEndpoint: shared.latticeEndpoint,
    initialLatticeEndpointMode: shared.latticeEndpointMode,
    initialPortfolioApiKey: shared.portfolioApiKey,
    persist
  })

  const setBiometricUnlock = async (enabled: boolean) => {
    if (biometricsBusy) return
    setBiometricsBusy(true)
    setBiometricsError('')

    try {
      if (!enabled) {
        const result = await link.executeCommand({ type: 'security.configure', mode: 'disabled' })
        if (!result.ok) throw new Error(operationError(result, 'Could not disable biometrics.'))
        return
      }

      let webAuthnError: Error | null = null
      if (await isWebAuthnBiometricsSupported()) {
        try {
          const enrollment = await createWebAuthnBiometricCredential()
          const result = await link.executeCommand({
            type: 'security.configure',
            mode: 'webauthn',
            ...enrollment
          })
          if (!result.ok) throw new Error(operationError(result, 'Could not enable biometrics.'))
          return
        } catch (error: any) {
          if (isBiometricUserCanceledError(error)) throw error
          webAuthnError = error
        }
      }

      const status = await link.executeQuery({ type: 'security.status' })
      if (!status.ok) throw new Error(operationError(status, 'Could not check biometrics.'))
      if (!status.biometrics.nativeAvailable) {
        throw webAuthnError || new Error('Biometrics are not available on this device')
      }
      const result = await link.executeCommand({ type: 'security.configure', mode: 'native' })
      if (!result.ok) throw new Error(operationError(result, 'Could not enable biometrics.'))
    } catch (error: any) {
      setBiometricsError(isBiometricUserCanceledError(error) ? '' : error.message || String(error))
    } finally {
      setBiometricsBusy(false)
    }
  }

  const setShowTestnets = (enabled: boolean) => {
    persist('show-testnets', enabled)
    if (!enabled && shared.networks[selectedChainId]?.isTestnet) setSelectedChainId(0)
  }

  return (
    <SettingsView
      drafts={drafts}
      onBack={() => openOverlay({ type: 'menu' })}
      onBiometricUnlockChange={(enabled) => void setBiometricUnlock(enabled)}
      onLock={() => {
        void link.executeCommand({ type: 'wallet.lock' }).then((result) => {
          if (result.ok) openOverlay({ type: 'menu' })
          else setBiometricsError(operationError(result, 'Could not lock Newframe.'))
        })
      }}
      onReset={(scope) => void link.executeCommand({ type: 'wallet.reset', scope })}
      onShowTestnetsChange={setShowTestnets}
      onUpdate={persist}
      settings={{ ...shared, biometricsBusy, biometricsError }}
    />
  )
}
