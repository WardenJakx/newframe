import React from 'react'
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

class Panel extends React.Component<PanelProps, PanelState> {
  constructor(props: PanelProps) {
    super(props)
    this.state = {
      password: '',
      unlockError: '',
      unlocking: false,
      biometrics: null,
      biometricAvailable: false,
      biometricUnlocking: false
    }
  }

  override componentDidMount() {
    void this.refreshBiometricsState()
  }

  override componentDidUpdate(previous: PanelProps) {
    if (previous.biometricUnlock !== this.props.biometricUnlock) void this.refreshBiometricsState()
  }

  async refreshBiometricsState() {
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

      this.setState({ biometrics, biometricAvailable })
    } catch {
      this.setState({ biometrics: null, biometricAvailable: false })
    }
  }

  async unlockApp() {
    if (this.state.unlocking) return

    const password = this.state.password
    this.setState({ unlocking: true, unlockError: '' })

    try {
      const result = await link.executeCommand({ type: 'security.unlock', method: 'password', password })
      if (!result.ok) throw new Error(result.message || 'Could not unlock Newframe')
      this.setState({ unlocking: false, unlockError: '', password: '' })
    } catch (error) {
      this.setState({ unlocking: false, unlockError: errorMessage(error) })
    }
  }

  async unlockWithBiometrics() {
    if (this.state.biometricUnlocking || !this.state.biometricAvailable) return

    const biometrics = this.state.biometrics
    if (!biometrics?.enabled) return

    this.setState({ biometricUnlocking: true, unlockError: '' })

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

      this.setState({ biometricUnlocking: false, unlockError: '', password: '' })
    } catch (err) {
      this.setState({
        biometricUnlocking: false,
        unlockError: isBiometricUserCanceledError(err) ? '' : errorMessage(err)
      })
    }
  }

  renderBiometricUnlockButton() {
    if (!this.state.biometricAvailable) return null

    return (
      <div
        aria-label='Unlock with biometrics'
        className='t2LockSubmit t2LockBiometricSubmit'
        onClick={() => this.unlockWithBiometrics()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            this.unlockWithBiometrics()
          }
        }}
        role='button'
        tabIndex={0}
      >
        {svg.fingerprint(15)}
        <span>{this.state.biometricUnlocking ? 'Authenticating' : 'Unlock with Biometrics'}</span>
      </div>
    )
  }

  renderLockBlocker() {
    return (
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
              value={this.state.password}
              onChange={(e) => this.setState({ password: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') this.unlockApp()
              }}
            />
          </div>
          {this.state.unlockError ? <div className='t2LockError'>{this.state.unlockError}</div> : null}
          <div
            aria-label='Unlock'
            className='t2LockSubmit'
            onClick={() => this.unlockApp()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                this.unlockApp()
              }
            }}
            role='button'
            tabIndex={0}
          >
            {this.state.unlocking ? 'Unlocking' : 'Unlock'}
          </div>
          {this.renderBiometricUnlockButton()}
        </div>
      </div>
    )
  }

  override render() {
    const { crumb } = this.props
    const requestViewOpen = crumb.view === 'requestView' || crumb.view === 'expandedModule'
    const opacity = !this.props.appLocked && this.props.initial ? 0 : 1

    if (this.props.appLocked) {
      return (
        <div id='panel' style={{ opacity }}>
          {this.renderLockBlocker()}
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
}

export default function App() {
  const panelState = useWalletSelector(useShallow(selectPanelState))
  return (
    <TrayNotificationProvider>
      <Panel {...panelState} />
    </TrayNotificationProvider>
  )
}
