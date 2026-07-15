import React, { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import Account from './Account'
import Notify from './Notify'
import Badge from './Badge'
import Footer from './Footer'
import Home from './Home'
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
    <div
      aria-label='Unlock with biometrics'
      className='t2LockSubmit t2LockBiometricSubmit'
      onClick={() => unlockWithBiometrics()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          unlockWithBiometrics()
        }
      }}
      role='button'
      tabIndex={0}
    >
      {svg.fingerprint(15)}
      <span>{state.biometricUnlocking ? 'Authenticating' : 'Unlock with Biometrics'}</span>
    </div>
  ) : null

  const lockBlocker = (
    <div aria-label='Unlock Newframe' className='t2LockBlocker' role='dialog'>
      <div className='t2LockPanel cardShow'>
        <div className='t2LockIcon'>{svg.lock(22)}</div>
        <div className='t2LockTitle'>Newframe Locked</div>
        <div className='t2LockInput'>
          <input
            aria-label='Newframe password'
            autoFocus
            placeholder='Newframe password'
            type='password'
            value={state.password}
            onChange={(e) => setState({ password: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') unlockApp()
            }}
          />
        </div>
        {state.unlockError ? <div className='t2LockError'>{state.unlockError}</div> : null}
        <div
          aria-label='Unlock'
          className='t2LockSubmit'
          onClick={() => unlockApp()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              unlockApp()
            }
          }}
          role='button'
          tabIndex={0}
        >
          {state.unlocking ? 'Unlocking' : 'Unlock'}
        </div>
        {biometricUnlockButton}
      </div>
    </div>
  )

  const { crumb } = props
  const requestViewOpen = crumb.view === 'requestView' || crumb.view === 'expandedModule'
  const opacity = !props.appLocked && props.initial ? 0 : 1

  if (props.appLocked) {
    return (
      <div id='panel' style={{ opacity }}>
        {lockBlocker}
      </div>
    )
  }

  return (
    <div id='panel' style={{ opacity }}>
      <Badge />
      <Notify />
      <Home />
      {requestViewOpen ? (
        <RequestViewProvider key={crumb.data?.requestId || crumb.view}>
          <div className='t2RequestOverlay'>
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
