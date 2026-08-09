import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import link from '../../../platform/ipc/renderer/link'
import {
  createWebAuthnBiometricCredential,
  isBiometricUserCanceledError,
  isWebAuthnBiometricsSupported
} from '../../security/renderer/biometrics'
import { useWalletSelector } from '../../../platform/state-sync/renderer/useAppSelector'
import { selectOperationById } from '../../../platform/state-sync/renderer/selectors/operation'
import { useHomeUiStore } from '../../../app/renderer/tray/Home/state/HomeUiProvider'
import { SettingsView } from './SettingsView'
import type { SettingsUpdateInput } from './types'
import { useSettingsDrafts } from './useSettingsDrafts'

function operationError(result: any, fallback: string) {
  return result && 'message' in result && typeof result.message === 'string' ? result.message : fallback
}

type SecuritySubmission =
  | { operationId: string; type: 'security.configure'; enabled: boolean }
  | { operationId: string; type: 'wallet.lock' }
  | { operationId: string; type: 'wallet.reset'; scope: 'saved-data' | 'all-settings-data' }

const projectedOperationError = (code: string | undefined, type: SecuritySubmission['type']) => {
  if (code === 'wallet_locked') return 'Unlock Newframe before enabling biometric login'
  if (code === 'biometrics_unavailable') return 'Biometrics are not available on this device'
  if (type === 'wallet.lock') return 'Could not lock Newframe.'
  if (type === 'wallet.reset') return 'Could not reset Newframe.'
  return 'Could not enable biometrics.'
}

interface SettingsProps {
  biometricRuntime?: {
    createCredential(): ReturnType<typeof createWebAuthnBiometricCredential>
    isCanceled(error: unknown): boolean
    isSupported(): Promise<boolean>
  }
}

export function Settings({
  biometricRuntime = {
    createCredential: createWebAuthnBiometricCredential,
    isCanceled: isBiometricUserCanceledError,
    isSupported: isWebAuthnBiometricsSupported
  }
}: SettingsProps = {}) {
  const shared = useWalletSelector(
    useShallow((state) => ({
      autoDiscoverTokens: !!state.autoDiscoverTokens,
      appLocked: !!state.appLock?.locked,
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
      portfolioApiKeyConfigured: !!state.portfolioApiKeyConfigured,
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
  const [browserPrompting, setBrowserPrompting] = useState(false)
  const [submission, setSubmission] = useState<SecuritySubmission | null>(null)
  const [localSecurityError, setLocalSecurityError] = useState('')
  const trackedOperation = useWalletSelector((state) =>
    submission ? selectOperationById(state, submission.operationId) : undefined
  )
  const operationInFlight =
    !!submission &&
    (!trackedOperation ||
      trackedOperation.status === 'pending' ||
      (trackedOperation.status === 'succeeded' &&
        ((submission.type === 'security.configure' && shared.biometricUnlock !== submission.enabled) ||
          (submission.type === 'wallet.lock' && !shared.appLocked))))
  const biometricsBusy = browserPrompting || (operationInFlight && submission?.type === 'security.configure')
  const biometricsError =
    trackedOperation?.status === 'failed' && submission
      ? projectedOperationError(trackedOperation.error?.code, submission.type)
      : localSecurityError

  useEffect(() => {
    if (!submission || trackedOperation?.status !== 'succeeded') return
    if (submission.type === 'security.configure' && shared.biometricUnlock !== submission.enabled) return
    if (submission.type === 'wallet.lock' && !shared.appLocked) return

    if (submission.type === 'wallet.lock') openOverlay({ type: 'menu' })
    const completedOperationId = submission.operationId
    queueMicrotask(() => {
      setSubmission((current) => (current?.operationId === completedOperationId ? null : current))
    })
  }, [openOverlay, shared.appLocked, shared.biometricUnlock, submission, trackedOperation?.status])
  const persist = (input: SettingsUpdateInput) =>
    void link.executeCommand({ type: 'settings.update', ...input })
  const drafts = useSettingsDrafts({
    initialLatticeEndpoint: shared.latticeEndpoint,
    initialLatticeEndpointMode: shared.latticeEndpointMode === 'custom' ? 'custom' : 'default',
    initialPortfolioApiKeyConfigured: shared.portfolioApiKeyConfigured,
    persist
  })

  const setBiometricUnlock = async (enabled: boolean) => {
    if (biometricsBusy) return
    setLocalSecurityError('')

    try {
      if (!enabled) {
        const operationId = crypto.randomUUID()
        setSubmission({ type: 'security.configure', operationId, enabled: false })
        const result = await link.executeCommand({
          type: 'security.configure',
          operationId,
          mode: 'disabled'
        })
        if (!result.ok) throw new Error(operationError(result, 'Could not disable biometrics.'))
        return
      }

      setBrowserPrompting(true)
      let browser:
        | {
            status: 'enrolled'
            credential: { version: 1; credentialId: string; salt: string }
            secret: string
          }
        | { status: 'unavailable' }
        | { status: 'failed' }
      if (!(await biometricRuntime.isSupported())) {
        browser = { status: 'unavailable' }
      } else {
        try {
          const enrollment = await biometricRuntime.createCredential()
          browser = { status: 'enrolled', ...enrollment }
        } catch (error: any) {
          if (biometricRuntime.isCanceled(error)) {
            setBrowserPrompting(false)
            return
          }
          browser = { status: 'failed' }
        }
      }

      const operationId = crypto.randomUUID()
      setBrowserPrompting(false)
      setSubmission({ type: 'security.configure', operationId, enabled: true })
      const result = await link.executeCommand({
        type: 'security.configure',
        operationId,
        mode: 'best-available',
        browser
      })
      if (!result.ok) throw new Error(operationError(result, 'Could not enable biometrics.'))
    } catch (error: any) {
      setBrowserPrompting(false)
      setSubmission(null)
      setLocalSecurityError(biometricRuntime.isCanceled(error) ? '' : error.message || String(error))
    }
  }

  const lockWallet = async () => {
    if (operationInFlight) return
    const operationId = crypto.randomUUID()
    setSubmission({ type: 'wallet.lock', operationId })
    setLocalSecurityError('')
    const result = await link.executeCommand({ type: 'wallet.lock', operationId })
    if (!result.ok) {
      setSubmission(null)
      setLocalSecurityError(operationError(result, 'Could not lock Newframe.'))
    }
  }

  const resetWallet = async (scope: 'saved-data' | 'all-settings-data') => {
    if (operationInFlight) return
    const operationId = crypto.randomUUID()
    setSubmission({ type: 'wallet.reset', operationId, scope })
    setLocalSecurityError('')
    const result = await link.executeCommand({ type: 'wallet.reset', operationId, scope })
    if (!result.ok) {
      setSubmission(null)
      setLocalSecurityError(operationError(result, 'Could not reset Newframe.'))
    }
  }

  const setShowTestnets = (enabled: boolean) => {
    persist({ setting: 'show-testnets', value: enabled })
    if (!enabled && shared.networks[selectedChainId]?.isTestnet) setSelectedChainId(0)
  }

  return (
    <SettingsView
      drafts={drafts}
      onBack={() => openOverlay({ type: 'menu' })}
      onBiometricUnlockChange={(enabled) => void setBiometricUnlock(enabled)}
      onLock={() => void lockWallet()}
      onReset={(scope) => void resetWallet(scope)}
      onShowTestnetsChange={setShowTestnets}
      onUpdate={persist}
      settings={{ ...shared, biometricsBusy, biometricsError }}
    />
  )
}
