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
type BiometricsState = {
  enabled: boolean
  method: 'webauthn' | 'native' | ''
  credential?: any
  nativeAvailable: boolean
}

class Panel extends React.Component<any, any> {
  declare store: Store
  vaultRefreshTimer: any
  biometricsObserver: any
  lastBiometricUnlock = false

  constructor(props: any, context?: any) {
    super(props, context)
    this.state = {
      vault: null,
      password: '',
      unlockError: '',
      unlocking: false,
      biometrics: null,
      biometricAvailable: false,
      biometricUnlocking: false
    }
  }

  override componentDidMount() {
    this.refreshVaultState()
    this.refreshBiometricsState()
    this.lastBiometricUnlock = !!this.store('main.biometricUnlock')
    this.biometricsObserver = this.store.observer(() => {
      const biometricUnlock = !!this.store('main.biometricUnlock')
      if (biometricUnlock === this.lastBiometricUnlock) return

      this.lastBiometricUnlock = biometricUnlock
      this.refreshBiometricsState()
    })
  }

  override componentWillUnmount() {
    clearTimeout(this.vaultRefreshTimer)
    if (this.biometricsObserver) this.biometricsObserver.remove()
  }

  refreshVaultState() {
    link.rpc('vaultState', (err: any, vault: any) => {
      this.setState({ vault: err ? { exists: false, unlocked: true } : vault })
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

  hotSigners() {
    const signers = this.store('main.signers') || {}
    return (Object.values(signers) as any[]).filter((signer: any) => ['ring', 'seed'].includes(signer.type))
  }

  lockedHotSigners() {
    return this.hotSigners().filter((signer: any) => {
      if (signer.status !== 'locked') return false

      const vaultSignerIsHydrating = signer.encryptionVersion === 2 && this.state.vault?.unlocked
      return !vaultSignerIsHydrating
    })
  }

  appLockStatus(): AppLockStatus {
    const vault = this.state.vault
    if (!vault) return 'checking'
    if (vault.exists && !vault.unlocked) return 'locked'
    if (this.lockedHotSigners().length > 0) return 'locked'
    return 'unlocked'
  }

  unlockApp() {
    if (this.state.unlocking) return

    const password = this.state.password
    const legacySigner = this.lockedHotSigners().find((signer: any) => signer.encryptionVersion !== 2)
    const done = (err: any) => {
      if (err) {
        return this.setState({ unlocking: false, unlockError: err.message || String(err) })
      }

      this.setState({ unlocking: false, unlockError: '', password: '' })
      this.vaultRefreshTimer = setTimeout(() => this.refreshVaultState(), 100)
    }

    this.setState({ unlocking: true, unlockError: '' })

    if (legacySigner) {
      link.rpc('unlockSigner', legacySigner.id, password, done)
    } else {
      link.rpc('unlockVault', password, done)
    }
  }

  async unlockWithBiometrics() {
    if (this.state.biometricUnlocking || !this.state.biometricAvailable) return

    const biometrics = this.state.biometrics as BiometricsState | null
    if (!biometrics?.enabled) return

    this.setState({ biometricUnlocking: true, unlockError: '' })

    try {
      if (biometrics.method === 'webauthn') {
        const secret = await getWebAuthnBiometricSecret(biometrics.credential)
        await this.rpc('unlockVaultWithBiometrics', { method: 'webauthn', secret })
      } else if (biometrics.method === 'native') {
        await this.rpc('unlockVaultWithBiometrics', { method: 'native' })
      } else {
        throw new Error('Biometric unlock is not configured')
      }

      this.setState({ biometricUnlocking: false, unlockError: '', password: '' })
      this.vaultRefreshTimer = setTimeout(() => this.refreshVaultState(), 100)
    } catch (err: any) {
      this.setState({
        biometricUnlocking: false,
        unlockError: isBiometricUserCanceledError(err) ? '' : err.message || String(err)
      })
    }
  }

  renderBiometricUnlockButton() {
    if (!this.state.biometricAvailable) return null
    if (this.lockedHotSigners().some((signer: any) => signer.encryptionVersion !== 2)) return null

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
    const opacity = this.store('tray.initial') ? 0 : 1
    const crumb = this.store('windows.panel.nav')[0] || {}
    const requestViewOpen = crumb.view === 'requestView' || crumb.view === 'expandedModule'
    const lockStatus = this.appLockStatus()

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
