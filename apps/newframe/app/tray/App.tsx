import React from 'react'
import Restore from 'react-restore'

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
  isWebAuthnBiometricsSupported
} from '../../resources/biometrics'

type AppLockStatus = 'checking' | 'locked' | 'unlocked'
type AppLockState = {
  locked: boolean
  vaultExists: boolean
  biometricUnlockEnabled: boolean
  biometricAvailable: boolean
}
type BiometricsState = {
  enabled: boolean
  method: 'webauthn' | 'native' | ''
  credential?: any
  nativeAvailable: boolean
}

class Panel extends React.Component<any, any> {
  declare store: Store
  appLockRefreshTimer: any
  biometricsObserver: any
  appLockStateListener: any
  lastBiometricUnlock = false

  constructor(props: any, context?: any) {
    super(props, context)
    this.state = {
      appLock: null,
      password: '',
      unlockError: '',
      unlocking: false,
      biometrics: null,
      biometricAvailable: false,
      biometricUnlocking: false
    }
  }

  override componentDidMount() {
    this.refreshAppLockState()
    this.refreshBiometricsState()
    this.lastBiometricUnlock = !!this.store('main.biometricUnlock')
    this.appLockStateListener = (action: string) => {
      if (action === 'appLockStateChanged') this.refreshAppLockState()
    }
    link.on('action', this.appLockStateListener)
    this.biometricsObserver = this.store.observer(() => {
      const biometricUnlock = !!this.store('main.biometricUnlock')
      if (biometricUnlock === this.lastBiometricUnlock) return

      this.lastBiometricUnlock = biometricUnlock
      this.refreshBiometricsState()
    })
  }

  override componentWillUnmount() {
    clearTimeout(this.appLockRefreshTimer)
    if (this.appLockStateListener) link.removeListener('action', this.appLockStateListener)
    if (this.biometricsObserver) this.biometricsObserver.remove()
  }

  refreshAppLockState() {
    link.rpc('appLockState', (err: any, appLock: AppLockState) => {
      this.setState({
        appLock: err
          ? {
              locked: false,
              vaultExists: false,
              biometricUnlockEnabled: false,
              biometricAvailable: false
            }
          : appLock
      })
    })
  }

  rpc<T>(method: string, ...args: any[]) {
    return new Promise<T>((resolve, reject) => {
      link.rpc(method, ...args, (err: any, value: T) => {
        if (err) return reject(new Error(err.message || String(err)))
        resolve(value)
      })
    })
  }

  async refreshBiometricsState() {
    try {
      const biometrics = await this.rpc<BiometricsState>('biometricsState')
      const biometricAvailable =
        biometrics.enabled &&
        (biometrics.method === 'native'
          ? biometrics.nativeAvailable
          : biometrics.method === 'webauthn' && (await isWebAuthnBiometricsSupported()))

      this.setState({ biometrics, biometricAvailable })
    } catch {
      this.setState({ biometrics: null, biometricAvailable: false })
    }
  }

  appLockStatus(): AppLockStatus {
    const appLock = this.state.appLock as AppLockState | null
    if (!appLock) return 'checking'
    if (appLock.locked) return 'locked'
    return 'unlocked'
  }

  unlockApp() {
    if (this.state.unlocking) return

    const password = this.state.password
    const done = (err: any) => {
      if (err) {
        return this.setState({ unlocking: false, unlockError: err.message || String(err) })
      }

      this.setState({ unlocking: false, unlockError: '', password: '' })
      this.appLockRefreshTimer = setTimeout(() => this.refreshAppLockState(), 100)
    }

    this.setState({ unlocking: true, unlockError: '' })

    link.rpc('unlockApp', password, done)
  }

  async unlockWithBiometrics() {
    if (this.state.biometricUnlocking || !this.state.biometricAvailable) return

    const biometrics = this.state.biometrics as BiometricsState | null
    if (!biometrics?.enabled) return

    this.setState({ biometricUnlocking: true, unlockError: '' })

    try {
      if (biometrics.method === 'webauthn') {
        const secret = await getWebAuthnBiometricSecret(biometrics.credential)
        await this.rpc('unlockAppWithBiometrics', { method: 'webauthn', secret })
      } else if (biometrics.method === 'native') {
        await this.rpc('unlockAppWithBiometrics', { method: 'native' })
      } else {
        throw new Error('Biometric unlock is not configured')
      }

      this.setState({ biometricUnlocking: false, unlockError: '', password: '' })
      this.appLockRefreshTimer = setTimeout(() => this.refreshAppLockState(), 100)
    } catch (err: any) {
      this.setState({
        biometricUnlocking: false,
        unlockError: isBiometricUserCanceledError(err) ? '' : err.message || String(err)
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

  renderLockChecking() {
    return (
      <div aria-label='Checking Newframe lock' className='t2LockBlocker' role='status'>
        <div className='t2LockChecking'>
          <div className='t2LockSpinner' />
        </div>
      </div>
    )
  }

  override render() {
    const crumb = this.store('windows.panel.nav')[0] || {}
    const requestViewOpen = crumb.view === 'requestView' || crumb.view === 'expandedModule'
    const lockStatus = this.appLockStatus()
    const opacity = lockStatus === 'unlocked' && this.store('tray.initial') ? 0 : 1

    if (lockStatus !== 'unlocked') {
      return (
        <div id='panel' style={{ opacity }}>
          {lockStatus === 'locked' ? this.renderLockBlocker() : this.renderLockChecking()}
        </div>
      )
    }

    return (
      <div id='panel' style={{ opacity }}>
        <Badge />
        <Notify />
        <Home />
        {requestViewOpen ? (
          <div className='t2RequestOverlay'>
            <Account />
          </div>
        ) : null}
        {requestViewOpen ? <Footer /> : null}
      </div>
    )
  }
}

export default Restore.connect(Panel)
