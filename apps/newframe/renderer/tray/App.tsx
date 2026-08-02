import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Button } from '@newframe/ui/button'
import { Dialog } from '@newframe/ui/dialog'
import { Input } from '@newframe/ui/input'
import { Stack } from '@newframe/ui/stack'
import { Text } from '@newframe/ui/text'

import { cva } from '../../generated/styled-system/css/cva.js'

import Account from './Account'
import Notify from './Notify'
import Badge from './Badge'
import Footer from './Footer'
import Home from './Home/Home'
import link from '../shared/link'
import { AppIcon } from '../shared/appIcon'
import {
  getWebAuthnBiometricSecret,
  isBiometricUserCanceledError,
  isWebAuthnBiometricsSupported,
  type StoredWebAuthnCredential
} from '../shared/biometrics'
import { useWalletSelector } from '../state/useAppSelector'
import { selectOperationById } from '../state/selectors/operation'
import type { TrayRendererState } from './state'
import { TrayNotificationProvider } from './notification'
import { RequestViewProvider } from './requestView'

type BiometricsState = {
  enabled: boolean
  method: 'webauthn' | 'native' | ''
  credential?: StoredWebAuthnCredential
  nativeAvailable: boolean
}

type PanelCrumb =
  | TrayRendererState['windows']['panel']['nav'][number]
  | { view?: undefined; data?: undefined }

type PanelProps = {
  appLocked: boolean
  biometricRuntime?: {
    getSecret(credential: StoredWebAuthnCredential): Promise<string>
    isCanceled(error: unknown): boolean
    isSupported(): Promise<boolean>
  }
  biometricUnlock: boolean
  crumb: PanelCrumb
  initial: boolean
}
type PanelState = {
  biometricAvailable: boolean
  biometrics: BiometricsState | null
  biometricPrompting: boolean
  password: string
  submission: { operationId: string; method: 'password' | 'native' | 'webauthn' } | null
  unlockError: string
}

const DEFAULT_BIOMETRIC_RUNTIME = {
  getSecret: getWebAuthnBiometricSecret,
  isCanceled: isBiometricUserCanceledError,
  isSupported: isWebAuthnBiometricsSupported
}

const EMPTY_CRUMB = {}
const isAppLocked = (appLock: unknown) =>
  !!appLock && typeof appLock === 'object' && 'locked' in appLock && appLock.locked === true
const errorMessage = (error: unknown) => {
  if (error && typeof error === 'object' && 'message' in error) return String(error.message)
  return String(error)
}
const operationError = (code: string | undefined) =>
  code === 'incorrect_password'
    ? 'Incorrect password'
    : code === 'biometric_authentication_failed'
      ? 'Biometric authentication failed'
      : 'Could not unlock Newframe'
const selectPanelState = (state: TrayRendererState): PanelProps => ({
  appLocked: isAppLocked(state.appLock),
  biometricUnlock: !!state.biometricUnlock,
  crumb: state.windows.panel.nav[0] || EMPTY_CRUMB,
  initial: state.tray.initial
})

const panelRecipe = cva({
  base: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    transitionDuration: 'fast',
    transitionProperty: 'opacity',
    transitionTimingFunction: 'standard'
  },
  variants: {
    visible: {
      true: { opacity: 'full' },
      false: { opacity: 0 }
    }
  },
  defaultVariants: { visible: true }
})

const lockIconRecipe = cva({
  base: {
    width: 'field',
    height: 'field',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 'pill',
    background: 'bg.control',
    color: 'action.primary'
  }
})

const requestOverlayRecipe = cva({
  base: { position: 'absolute', inset: 0, zIndex: 'overlay', background: 'bg.primary' }
})

export function Panel(props: PanelProps) {
  const biometricRuntime = props.biometricRuntime || DEFAULT_BIOMETRIC_RUNTIME
  const [state, setPanelState] = useState<PanelState>({
    password: '',
    unlockError: '',
    submission: null,
    biometrics: null,
    biometricAvailable: false,
    biometricPrompting: false
  })
  const setState = (update: Partial<PanelState>) => setPanelState((current) => ({ ...current, ...update }))
  const unlockOperation = useWalletSelector((walletState) =>
    state.submission ? selectOperationById(walletState, state.submission.operationId) : undefined
  )
  const operationInFlight =
    !!state.submission &&
    (!unlockOperation ||
      unlockOperation.status === 'pending' ||
      (unlockOperation.status === 'succeeded' && props.appLocked))
  const passwordUnlocking = operationInFlight && state.submission?.method === 'password'
  const biometricUnlocking =
    state.biometricPrompting || (operationInFlight && state.submission?.method !== 'password')
  const projectedUnlockError =
    unlockOperation?.status === 'failed' ? operationError(unlockOperation.error?.code) : ''

  useEffect(() => {
    if (state.submission && unlockOperation?.status === 'succeeded' && !props.appLocked) {
      const completedOperationId = state.submission.operationId
      queueMicrotask(() => {
        setPanelState((current) =>
          current.submission?.operationId === completedOperationId
            ? { ...current, submission: null, unlockError: '', password: '' }
            : current
        )
      })
    }
  }, [props.appLocked, state.submission, unlockOperation?.status])

  async function unlockApp() {
    if (passwordUnlocking) return

    const password = state.password
    const operationId = crypto.randomUUID()
    setState({ submission: { operationId, method: 'password' }, unlockError: '' })

    try {
      const result = await link.executeCommand({
        type: 'security.unlock',
        operationId,
        method: 'password',
        password
      })
      if (!result.ok) throw new Error(result.message || 'Could not unlock Newframe')
    } catch (error) {
      setState({ submission: null, unlockError: errorMessage(error) })
    }
  }

  async function unlockWithBiometrics() {
    if (biometricUnlocking || !state.biometricAvailable) return

    const biometrics = state.biometrics
    if (!biometrics?.enabled) return

    setState({ biometricPrompting: biometrics.method === 'webauthn', unlockError: '' })

    try {
      if (biometrics.method === 'webauthn') {
        if (!biometrics.credential) throw new Error('Biometric credential is unavailable')
        const secret = await biometricRuntime.getSecret(biometrics.credential)
        const operationId = crypto.randomUUID()
        setState({
          biometricPrompting: false,
          submission: { operationId, method: 'webauthn' }
        })
        const result = await link.executeCommand({
          type: 'security.unlock',
          operationId,
          method: 'webauthn',
          secret
        })
        if (!result.ok) throw new Error(result.message || 'Could not unlock Newframe')
      } else if (biometrics.method === 'native') {
        const operationId = crypto.randomUUID()
        setState({ submission: { operationId, method: 'native' } })
        const result = await link.executeCommand({ type: 'security.unlock', operationId, method: 'native' })
        if (!result.ok) throw new Error(result.message || 'Could not unlock Newframe')
      } else {
        throw new Error('Biometric unlock is not configured')
      }
    } catch (err) {
      setState({
        biometricPrompting: false,
        submission: null,
        unlockError: biometricRuntime.isCanceled(err) ? '' : errorMessage(err)
      })
    }
  }

  useEffect(() => {
    let active = true

    async function refreshBiometricsState() {
      try {
        const status = await link.executeQuery({ type: 'security.status' })
        if (!status.ok) throw new Error(status.message || 'Could not read biometric configuration')

        const biometrics: BiometricsState = status.biometrics
        const biometricAvailable =
          status.biometricAvailable &&
          (biometrics.method === 'native'
            ? biometrics.nativeAvailable
            : biometrics.method === 'webauthn' &&
              !!biometrics.credential &&
              (await biometricRuntime.isSupported()))

        if (active) {
          setPanelState((current) => ({ ...current, biometrics, biometricAvailable }))
        }
      } catch {
        if (active) {
          setPanelState((current) => ({ ...current, biometrics: null, biometricAvailable: false }))
        }
      }
    }

    void refreshBiometricsState()
    return () => {
      active = false
    }
  }, [biometricRuntime, props.biometricUnlock])

  const biometricUnlockButton = state.biometricAvailable ? (
    <Button
      appearance='control'
      label='Unlock with biometrics'
      onPress={() => unlockWithBiometrics()}
      shape='pill'
      width='full'
    >
      <AppIcon name='fingerprint' size={15} />
      <Text variant='action'>{biometricUnlocking ? 'Authenticating' : 'Unlock with Biometrics'}</Text>
    </Button>
  ) : null

  const lockBlocker = (
    <Dialog label='Unlock Newframe' padding='medium' tone='opaque' width='compact'>
      <Stack align='center' gap='medium'>
        <span className={lockIconRecipe()}>
          <AppIcon name='lock' size={22} />
        </span>
        <Text variant='heading'>Newframe Locked</Text>
        <Input
          align='start'
          autoFocus
          label='Newframe password'
          onSubmit={unlockApp}
          onValueChange={(password) => setState({ password })}
          placeholder='Newframe password'
          type='password'
          value={state.password}
        />
        {projectedUnlockError || state.unlockError ? (
          <Text align='center' tone='danger' variant='supporting'>
            {projectedUnlockError || state.unlockError}
          </Text>
        ) : null}
        <Button appearance='primary' label='Unlock' onPress={unlockApp} shape='pill' width='full'>
          <Text variant='action'>{passwordUnlocking ? 'Unlocking' : 'Unlock'}</Text>
        </Button>
        {biometricUnlockButton}
      </Stack>
    </Dialog>
  )

  const { crumb } = props
  const requestViewOpen = crumb.view === 'requestView' || crumb.view === 'expandedModule'
  const visible = props.appLocked || !props.initial

  if (props.appLocked) {
    return (
      <div className={panelRecipe({ visible })} id='panel'>
        {lockBlocker}
      </div>
    )
  }

  return (
    <div className={panelRecipe({ visible })} id='panel'>
      <Badge />
      <Notify />
      <Home />
      {requestViewOpen ? (
        <RequestViewProvider key={crumb.view === 'requestView' ? crumb.data.requestId : crumb.view}>
          <div className={requestOverlayRecipe()}>
            <Account />
          </div>
          <Footer />
        </RequestViewProvider>
      ) : null}
    </div>
  )
}

export default function App() {
  const panelState = useWalletSelector(useShallow(selectPanelState))
  return (
    <TrayNotificationProvider>
      <Panel {...panelState} />
    </TrayNotificationProvider>
  )
}
