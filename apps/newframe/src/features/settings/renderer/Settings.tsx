import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { useWalletSelector } from '../../../platform/state-sync/renderer/useAppSelector'
import { selectOperationById } from '../../../platform/state-sync/renderer/selectors/operation'
import { SettingsView } from './SettingsView'
import type { SettingsUpdateInput } from './types'
import { useSettingsDrafts } from './useSettingsDrafts'
import type { SettingsCapability } from './settingsCapability'
import type { CommandMap, CommandResult } from '../../../app/contracts/operations'

type WithoutType<T> = T extends { type: string } ? Omit<T, 'type'> : never

export interface SettingsSecurityCapability {
  configure(input: WithoutType<CommandMap['security.configure']>): Promise<CommandResult>
  lock(input: WithoutType<CommandMap['wallet.lock']>): Promise<CommandResult>
  reset(input: WithoutType<CommandMap['wallet.reset']>): Promise<CommandResult>
  createWebAuthnCredential(): Promise<{
    credential: { version: 1; credentialId: string; salt: string }
    secret: string
  }>
  isBiometricUserCanceled(error: unknown): boolean
  isWebAuthnSupported(): Promise<boolean>
}

function operationError(result: CommandResult, fallback: string) {
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

const accountLimit = (value: number | undefined): 5 | 10 | 20 | 40 =>
  value === 10 || value === 20 || value === 40 ? value : 5
const latticeDerivation = (value: string | undefined): 'standard' | 'legacy' | 'live' =>
  value === 'legacy' || value === 'live' ? value : 'standard'
const ledgerDerivation = (value: string | undefined): 'live' | 'legacy' | 'standard' | 'testnet' =>
  value === 'legacy' || value === 'standard' || value === 'testnet' ? value : 'live'
const trezorDerivation = (value: string | undefined): 'standard' | 'legacy' | 'testnet' =>
  value === 'legacy' || value === 'testnet' ? value : 'standard'

export interface SettingsProps {
  capability: Pick<SettingsCapability, 'update'>
  onBack: () => void
  onPostLockNavigation: () => void
  onSelectedChainChange: (chainId: number) => void
  selectedChainId: number
  security: SettingsSecurityCapability
}

export function Settings({
  capability,
  onBack,
  onPostLockNavigation,
  onSelectedChainChange,
  selectedChainId,
  security
}: SettingsProps) {
  const shared = useWalletSelector(
    useShallow((state) => ({
      autoDiscoverTokens: !!state.autoDiscoverTokens,
      appLocked: !!state.appLock?.locked,
      autohide: !!state.autohide,
      biometricUnlock: !!state.biometricUnlock,
      latticeAccountLimit: accountLimit(state.latticeSettings?.accountLimit),
      latticeDerivation: latticeDerivation(state.latticeSettings?.derivation),
      latticeEndpoint: state.latticeSettings?.endpointCustom || '',
      latticeEndpointMode: state.latticeSettings?.endpointMode || 'default',
      launch: !!state.launch,
      ledgerDerivation: ledgerDerivation(state.ledger?.derivation),
      liveAccountLimit: accountLimit(state.ledger?.liveAccountLimit),
      menubarGasPrice: !!state.menubarGasPrice,
      networks: state.networks?.ethereum || {},
      platform: state.platform || '',
      portfolioApiKeyConfigured: !!state.portfolioApiKeyConfigured,
      reveal: !!state.reveal,
      showLocalNameWithENS: !!state.showLocalNameWithENS,
      showTestnets: !!state.showTestnets,
      summonShortcut: state.shortcuts?.summon,
      trezorDerivation: trezorDerivation(state.trezor?.derivation)
    }))
  )
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

    if (submission.type === 'wallet.lock') onPostLockNavigation()
    const completedOperationId = submission.operationId
    queueMicrotask(() => {
      setSubmission((current) => (current?.operationId === completedOperationId ? null : current))
    })
  }, [onPostLockNavigation, shared.appLocked, shared.biometricUnlock, submission, trackedOperation?.status])
  const persist = (input: SettingsUpdateInput) => void capability.update(input)
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
        const result = await security.configure({
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
      if (!(await security.isWebAuthnSupported())) {
        browser = { status: 'unavailable' }
      } else {
        try {
          const enrollment = await security.createWebAuthnCredential()
          browser = { status: 'enrolled', ...enrollment }
        } catch (error: unknown) {
          if (security.isBiometricUserCanceled(error)) {
            setBrowserPrompting(false)
            return
          }
          browser = { status: 'failed' }
        }
      }

      const operationId = crypto.randomUUID()
      setBrowserPrompting(false)
      setSubmission({ type: 'security.configure', operationId, enabled: true })
      const result = await security.configure({
        operationId,
        mode: 'best-available',
        browser
      })
      if (!result.ok) throw new Error(operationError(result, 'Could not enable biometrics.'))
    } catch (error: unknown) {
      setBrowserPrompting(false)
      setSubmission(null)
      const message =
        error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error)
      setLocalSecurityError(security.isBiometricUserCanceled(error) ? '' : message)
    }
  }

  const lockWallet = async () => {
    if (operationInFlight) return
    const operationId = crypto.randomUUID()
    setSubmission({ type: 'wallet.lock', operationId })
    setLocalSecurityError('')
    const result = await security.lock({ operationId })
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
    const result = await security.reset({ operationId, scope })
    if (!result.ok) {
      setSubmission(null)
      setLocalSecurityError(operationError(result, 'Could not reset Newframe.'))
    }
  }

  const setShowTestnets = (enabled: boolean) => {
    persist({ setting: 'show-testnets', value: enabled })
    if (!enabled && shared.networks[selectedChainId]?.isTestnet) onSelectedChainChange(0)
  }

  return (
    <SettingsView
      drafts={drafts}
      onBack={onBack}
      onBiometricUnlockChange={(enabled) => void setBiometricUnlock(enabled)}
      onLock={() => void lockWallet()}
      onReset={(scope) => void resetWallet(scope)}
      onShowTestnetsChange={setShowTestnets}
      onUpdate={persist}
      settings={{ ...shared, biometricsBusy, biometricsError }}
    />
  )
}
