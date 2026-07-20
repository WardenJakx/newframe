import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Button } from '@newframe/ui/button'
import { Dialog } from '@newframe/ui/dialog'
import { Input } from '@newframe/ui/input'
import { Stack } from '@newframe/ui/stack'
import { Text } from '@newframe/ui/text'

import { cva } from '../../resources/styled-system/css/cva.js'

import Account from './Account'
import Notify from './Notify'
import Badge from './Badge'
import Footer from './Footer'
import Home from './Home/Home'
import link from '../../resources/link'
import svg from '../../resources/svg'
import {
  getWebAuthnBiometricSecret,
  isBiometricUserCanceledError,
  isWebAuthnBiometricsSupported,
  type StoredWebAuthnCredential
} from '../../resources/biometrics'
import { useWalletSelector } from '../state/useAppSelector'
import type { TrayRendererState } from './state'
import { TrayNotificationProvider } from './notification'
import { RequestViewProvider } from './requestView'

type BiometricsState = {
  enabled: boolean
  method: 'webauthn' | 'native' | ''
  credential?: StoredWebAuthnCredential
  nativeAvailable: boolean
}

type PanelProps = {
  appLocked: boolean
  biometricUnlock: boolean
  crumb: { view?: string; data?: { requestId?: string } }
  initial: boolean
}
type PanelState = {
  biometricAvailable: boolean
  biometrics: BiometricsState | null
  biometricUnlocking: boolean
  password: string
  unlockError: string
  unlocking: boolean
}

const EMPTY_CRUMB = {}
const isAppLocked = (appLock: unknown) =>
  !!appLock && typeof appLock === 'object' && 'locked' in appLock && appLock.locked === true
const errorMessage = (error: unknown) => {
  if (error && typeof error === 'object' && 'message' in error) return String(error.message)
  return String(error)
}
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

function Panel(props: PanelProps) {
  const [state, setPanelState] = useState<PanelState>({
    password: '',
    unlockError: '',
    unlocking: false,
    biometrics: null,
    biometricAvailable: false,
    biometricUnlocking: false
  })
  const setState = (update: Partial<PanelState>) => setPanelState((current) => ({ ...current, ...update }))

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
            (await isWebAuthnBiometricsSupported()))

      setState({ biometrics, biometricAvailable })
    } catch {
      setState({ biometrics: null, biometricAvailable: false })
    }
  }

  async function unlockApp() {
    if (state.unlocking) return

    const password = state.password
    setState({ unlocking: true, unlockError: '' })

    try {
      const result = await link.executeCommand({ type: 'security.unlock', method: 'password', password })
      if (!result.ok) throw new Error(result.message || 'Could not unlock Newframe')
      setState({ unlocking: false, unlockError: '', password: '' })
    } catch (error) {
      setState({ unlocking: false, unlockError: errorMessage(error) })
    }
  }

  async function unlockWithBiometrics() {
    if (state.biometricUnlocking || !state.biometricAvailable) return

    const biometrics = state.biometrics
    if (!biometrics?.enabled) return

    setState({ biometricUnlocking: true, unlockError: '' })

    try {
      if (biometrics.method === 'webauthn') {
        if (!biometrics.credential) throw new Error('Biometric credential is unavailable')
        const secret = await getWebAuthnBiometricSecret(biometrics.credential)
        const result = await link.executeCommand({ type: 'security.unlock', method: 'webauthn', secret })
        if (!result.ok) throw new Error(result.message || 'Could not unlock Newframe')
      } else if (biometrics.method === 'native') {
        const result = await link.executeCommand({ type: 'security.unlock', method: 'native' })
        if (!result.ok) throw new Error(result.message || 'Could not unlock Newframe')
      } else {
        throw new Error('Biometric unlock is not configured')
      }

      setState({ biometricUnlocking: false, unlockError: '', password: '' })
    } catch (err) {
      setState({
        biometricUnlocking: false,
        unlockError: isBiometricUserCanceledError(err) ? '' : errorMessage(err)
      })
    }
  }

  useEffect(() => {
    void refreshBiometricsState()
  }, [props.biometricUnlock])

  const biometricUnlockButton = state.biometricAvailable ? (
    <Button
      appearance='control'
      label='Unlock with biometrics'
      onPress={() => unlockWithBiometrics()}
      shape='pill'
      width='full'
    >
      {svg.fingerprint(15)}
      <Text variant='action'>{state.biometricUnlocking ? 'Authenticating' : 'Unlock with Biometrics'}</Text>
    </Button>
  ) : null

  const lockBlocker = (
    <Dialog label='Unlock Newframe' padding='medium' tone='opaque' width='compact'>
      <Stack align='center' gap='medium'>
        <span className={lockIconRecipe()}>{svg.lock(22)}</span>
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
        {state.unlockError ? (
          <Text align='center' tone='danger' variant='supporting'>
            {state.unlockError}
          </Text>
        ) : null}
        <Button appearance='primary' label='Unlock' onPress={unlockApp} shape='pill' width='full'>
          <Text variant='action'>{state.unlocking ? 'Unlocking' : 'Unlock'}</Text>
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
        <RequestViewProvider key={crumb.data?.requestId || crumb.view}>
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
