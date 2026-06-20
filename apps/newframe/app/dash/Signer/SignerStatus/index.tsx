import React from 'react'
import Restore from 'react-restore'
import link from '../../../../resources/link'
import svg from '../../../../resources/svg'
import { isHardwareSigner } from '../../../../resources/domain/signer'

class SignerStatus extends React.Component<any, any> {
  declare store: Store
  statusRef: any
  inputRef: any

  constructor(props: any, context?: any) {
    super(props, context)
    // this.moduleRef = React.createRef()
    // this.resizeObserver = new ResizeObserver(() => {
    //   if (this.moduleRef && this.moduleRef.current) {
    //     link.send('tray:action', 'updateAccountModule', this.props.moduleId, { height: this.moduleRef.current.clientHeight })
    //   }
    // })
    this.state = {
      expand: false,
      shake: false,
      vault: null
    }
    this.statusRef = React.createRef()
    this.inputRef = React.createRef()
  }

  override componentDidMount() {
    link.rpc('vaultState', (err: any, vault: any) => {
      if (!err) this.setState({ vault })
    })
  }

  shake() {
    this.setState({ shake: true })
    setTimeout(() => {
      this.setState({ shake: false })
    }, 1200)
  }

  unlockChange(e: any) {
    this.setState({ unlockInput: e.target.value })
  }

  unlockSubmit() {
    link.rpc('unlockSigner', this.props.signer.id, this.state.unlockInput || '', (err: any) => {
      if (err) this.shake()
    })
  }

  trezorPin(num: any) {
    this.setState({ tPin: this.state.tPin + num.toString() })
  }

  submitPin() {
    link.rpc('trezorPin', this.props.signer.id, this.state.tPin, () => {})
    this.setState({ tPin: '' })
  }

  backspacePin(e: any) {
    e.stopPropagation()
    this.setState({ tPin: this.state.tPin ? this.state.tPin.slice(0, -1) : '' })
  }

  renderTrezorPin(active: any) {
    return (
      <div className='trezorPinWrap' style={active ? {} : { height: '0px', padding: '0px 0px 0px 0px' }}>
        <div className='trezorPinInput'>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
            <div key={i} className='trezorPinInputButton' onMouseDown={this.trezorPin.bind(this, i)}>
              {svg.octicon('primitive-dot', { height: 20 })}
            </div>
          ))}
        </div>
      </div>
    )
  }

  // componentDidMount () {
  //   setTimeout(() => {
  //     document.addEventListener('mousedown', (e) => {
  //       if (this.props.open && this.statusRef && this.statusRef.current && !this.statusRef.current.contains(e.target)) {
  //         this.props.setSignerStatusOpen(false)
  //       }
  //     })
  //     if (this.inputRef.current) {
  //       this.inputRef.current.focus()
  //     }
  //   }, 100)
  // }

  override render() {
    const { shake, vault } = this.state

    const signer = this.props.signer || {}

    if (isHardwareSigner(signer) || !signer.id || signer.status !== 'locked') return null

    // Vault signers unlock with the already-unlocked vault session, no
    // password input needed
    const vaultSigner = signer.encryptionVersion === 2
    const oneClickUnlock = vaultSigner && vault && vault.unlocked

    return (
      <div className={shake ? 'signerStatus headShake' : 'signerStatus'} ref={this.statusRef}>
        <div className='signerStatusWrap'>
          <div className='signerStatusMain'>
            <div className='signerUnlockWrap'>
              {oneClickUnlock ? (
                <div className='signerUnlockSubmit' onClick={this.unlockSubmit.bind(this)}>
                  {'Unlock'}
                </div>
              ) : (
                <>
                  <input
                    autoFocus={true}
                    ref={this.inputRef}
                    className='signerUnlockInput'
                    type='password'
                    value={this.state.unlockInput}
                    onChange={this.unlockChange.bind(this)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        this.unlockSubmit()
                      }
                    }}
                  />
                  <div className='signerUnlockInputLabel'>
                    {vaultSigner ? 'Enter Newframe password to unlock' : 'Enter password to unlock'}
                  </div>
                  <div className='signerUnlockSubmit' onClick={this.unlockSubmit.bind(this)}>
                    {'Unlock'}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }
}

export default Restore.connect(SignerStatus)
