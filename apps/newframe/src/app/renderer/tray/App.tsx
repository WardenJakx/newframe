import { useCallback, useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Button } from '@newframe/ui/button'
import { Dialog } from '@newframe/ui/dialog'
import { Input } from '@newframe/ui/input'
import { Stack } from '@newframe/ui/stack'
import { Text } from '@newframe/ui/text'

import { cva } from '../../../../generated/styled-system/css/cva.js'

import Account from '../../../features/requests/renderer/Account'
import Notify from './Notify'
import Badge from '../../../platform/app-update/renderer'
import { updaterCapability } from '../../../platform/app-update/renderer/production'
import Footer from './Footer'
import Home from './Home/Home'
import { AppIcon } from '../../../shared/renderer/ui/appIcon'
import {
  getWebAuthnBiometricSecret,
  isBiometricUserCanceledError,
  isWebAuthnBiometricsSupported,
  type StoredWebAuthnCredential
} from '../../../features/security/renderer/biometrics'
import { useWalletSelector } from '../../../platform/state-sync/renderer/useAppSelector'
import { selectOperationById } from '../../../platform/state-sync/renderer/selectors/operation'
import type { TrayRendererState } from './state'
import { TrayNotificationProvider, useTrayNotification } from './notification'
import { RequestViewProvider } from '../../../features/requests/renderer/requestView'
import { requestCapabilities } from '../capabilities/requests'
import type { RequestCommandNotifier } from '../../../features/requests/renderer/RequestCommand'
import type { RequestRendererCapabilities } from '../../../features/requests/renderer/requestCapabilities'
import { accountsCapability } from '../capabilities/accounts'
import {
  activityCapability,
  connectionsCapability,
  networksCapability,
  ordersCapability,
  portfolioCapability,
  securityCapability,
  settingsCapability,
  tokensCapability
} from '../capabilities/homeFeatures'
import { homeCapability } from '../capabilities/home'
import type { HomeCapabilities } from './Home/Home'
import type { SecurityCapability } from '../../../features/security/renderer/securityCapability'

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
  notifyRequest: RequestCommandNotifier
  requestCapabilities: RequestRendererCapabilities
  security: Pick<SecurityCapability, 'status' | 'unlock'>
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

const HOME_CAPABILITIES: HomeCapabilities = {
  accounts: accountsCapability,
  activity: activityCapability,
  connections: connectionsCapability,
  home: homeCapability,
  networks: networksCapability,
  orders: ordersCapability,
  portfolio: portfolioCapability,
  requests: requestCapabilities,
  security: securityCapability,
  settings: settingsCapability,
  tokens: tokensCapability
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
const selectPanelState = (
  state: TrayRendererState
): Omit<PanelProps, 'biometricRuntime' | 'notifyRequest' | 'requestCapabilities' | 'security'> => ({
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
      const result = await props.security.unlock({
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
        const result = await props.security.unlock({
          operationId,
          method: 'webauthn',
          secret
        })
        if (!result.ok) throw new Error(result.message || 'Could not unlock Newframe')
      } else if (biometrics.method === 'native') {
        const operationId = crypto.randomUUID()
        setState({ submission: { operationId, method: 'native' } })
        const result = await props.security.unlock({ operationId, method: 'native' })
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
        const status = await props.security.status({})
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
  }, [biometricRuntime, props.biometricUnlock, props.security])

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
      <Badge capability={updaterCapability} />
      <Notify
        external={props.requestCapabilities.external}
        home={HOME_CAPABILITIES.home}
        review={props.requestCapabilities.review}
      />
      <Home capabilities={{ ...HOME_CAPABILITIES, requests: props.requestCapabilities }} />
      {requestViewOpen ? (
        <RequestViewProvider key={crumb.view === 'requestView' ? crumb.data.requestId : crumb.view}>
          <div className={requestOverlayRecipe()}>
            <Account capabilities={props.requestCapabilities} />
          </div>
          <Footer capabilities={props.requestCapabilities} notify={props.notifyRequest} />
        </RequestViewProvider>
      ) : null}
    </div>
  )
}

function ComposedPanel() {
  const panelState = useWalletSelector(useShallow(selectPanelState))
  const { notify } = useTrayNotification()
  const notifyRequest = useCallback<RequestCommandNotifier>(({ data, type }) => notify(type, data), [notify])
  return (
    <Panel
      {...panelState}
      notifyRequest={notifyRequest}
      requestCapabilities={requestCapabilities}
      security={securityCapability}
    />
  )
}

export default function App() {
  return (
    <TrayNotificationProvider>
      <ComposedPanel />
    </TrayNotificationProvider>
  )
}
