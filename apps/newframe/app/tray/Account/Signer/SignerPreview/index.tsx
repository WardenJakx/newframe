import React from 'react'
import Restore from 'react-restore'

import link from '../../../../../resources/link'
import svg from '../../../../../resources/svg'
import { findUnavailableSigners, isHardwareSigner } from '../../../../../resources/domain/signer'
import { accountPanelCrumb, signerPanelCrumb } from '../../../../../resources/domain/nav'

import { Cluster, ClusterRow, ClusterColumn, ClusterValue } from '../../../../../resources/Components/Cluster'

const isWatchOnly = (account: any = {}) => {
  return ['address'].includes(account.lastSignerType.toLowerCase())
}

class Signer extends React.Component<any, any> {
  declare store: Store
  moduleRef: React.RefObject<HTMLDivElement | null>
  resizeObserver?: ResizeObserver

  constructor(props: any, context?: any) {
    super(props, context)
    this.moduleRef = React.createRef()
    if (!this.props.expanded) {
      this.resizeObserver = new ResizeObserver(() => {
        if (this.moduleRef && this.moduleRef.current) {
          link.send('tray:action', 'updateAccountModule', this.props.moduleId, {
            height: this.moduleRef.current.clientHeight
          })
        }
      })
    }
    this.state = {
      notifySuccess: false,
      notifyText: ''
    }
  }

  override componentDidMount() {
    if (this.resizeObserver) this.resizeObserver.observe(this.moduleRef.current as Element)
  }

  override componentWillUnmount() {
    if (this.resizeObserver) this.resizeObserver.disconnect()
  }

  verifyAddress(hardwareSigner: any) {
    if (hardwareSigner) {
      // prompt for on-signer verification
      this.setState({ notifySuccess: false, notifyText: 'Verify address on signer' })
    }
    link.rpc('verifyAddress', (err: any) => {
      if (err) {
        this.setState({ notifySuccess: false, notifyText: err })
      } else {
        this.setState({ notifySuccess: true, notifyText: 'Address matched!' })
      }
      setTimeout(() => {
        this.setState({ notifySuccess: false, notifyText: '' })
      }, 5000)
    })
  }

  renderSignerType(type: any) {
    if (type === 'lattice') {
      return (
        <div className='moduleItemSignerType'>
          <div className='moduleItemIcon'>{svg.lattice(18)}</div>
          <div>{'GridPlus'}</div>
        </div>
      )
    } else if (type === 'ledger') {
      return (
        <div className='moduleItemSignerType'>
          <div className='moduleItemIcon'>{svg.ledger(16)}</div>
          <div>{'Ledger'}</div>
        </div>
      )
    } else if (type === 'trezor') {
      return (
        <div className='moduleItemSignerType'>
          <div className='moduleItemIcon'>{svg.trezor(15)}</div>
          <div>{'Trezor'}</div>
        </div>
      )
    } else if (type === 'seed' || type === 'ring') {
      return (
        <div className='moduleItemSignerType'>
          <div className='moduleItemIcon'>{svg.flame(16)}</div>
          <div>{'Hot'}</div>
        </div>
      )
    } else {
      return (
        <div className='moduleItemSignerType'>
          <div className='moduleItemIcon'>{svg.mask(20)}</div>
          <div>{'Watch-only'}</div>
        </div>
      )
    }
  }

  getCurrentStatus(activeSigner: any, hardwareSigner: any) {
    let status: string
    const style: any = {
      marginLeft: '10px',
      padding: '12px'
    }

    if (activeSigner && activeSigner.status) {
      if (activeSigner.status.toLowerCase() === 'ok') {
        status = 'ready to sign'
        style.color = 'var(--good)'
      } else if (activeSigner.status.toLowerCase() === 'locked') {
        style.color = 'var(--moon)'
        status = activeSigner.status
      } else {
        status = activeSigner.status
      }
    } else if (hardwareSigner) {
      style.color = 'var(--bad)'
      status = 'Disconnected'
    } else {
      style.color = 'var(--bad)'
      status = 'No Signer'
    }

    return (
      <div className='clusterTag' style={style}>
        {status}
      </div>
    )
  }

  override render() {
    const activeAccount = this.store('main.accounts', this.props.account)

    let activeSigner: any

    if (activeAccount.signer) {
      activeSigner = this.store('main.signers', activeAccount.signer)
    }

    const hardwareSigner = isHardwareSigner(activeAccount.lastSignerType)
    const watchOnly = isWatchOnly(activeAccount)

    return (
      <div className='balancesBlock' ref={this.moduleRef}>
        <div className='moduleHeader'>
          <span style={{ position: 'relative', top: '2px' }}>{svg.sign(19)}</span>
          <span>{'Signer'}</span>
        </div>
        <Cluster>
          <ClusterRow>
            <ClusterColumn>
              <ClusterValue
                onClick={() => {
                  const getUnavailableSigner = () => {
                    const signers = Object.values(this.store('main.signers'))
                    const unavailableSigners = findUnavailableSigners(
                      activeAccount.lastSignerType,
                      signers as any
                    )
                    return unavailableSigners.length === 1 && unavailableSigners[0]
                  }
                  const signer = activeSigner || getUnavailableSigner()
                  if (!signer) {
                    this.setState({
                      notifySuccess: false,
                      notifyText: 'Signer Unavailable'
                    })
                    setTimeout(() => {
                      this.setState({ notifySuccess: false, notifyText: '' })
                    }, 5000)
                  }
                  const crumb = signer ? signerPanelCrumb(signer) : accountPanelCrumb()
                  link.send('tray:action', 'navDash', crumb)
                }}
              >
                <div
                  style={{
                    padding: '20px'
                  }}
                >
                  {this.renderSignerType(activeAccount.lastSignerType)}
                </div>
              </ClusterValue>
              <ClusterValue>{this.getCurrentStatus(activeSigner, hardwareSigner)}</ClusterValue>
            </ClusterColumn>
            {!watchOnly && (
              <ClusterColumn width={'80px'}>
                <ClusterValue onClick={() => this.verifyAddress(hardwareSigner)}>
                  {svg.doubleCheck(20)}
                </ClusterValue>
              </ClusterColumn>
            )}
          </ClusterRow>
          {this.state.notifyText && (
            <ClusterRow>
              <ClusterValue>
                <div
                  className='clusterTag'
                  style={{
                    color: this.state.notifySuccess ? 'var(--good)' : 'var(--bad)'
                  }}
                >
                  {this.state.notifyText}
                </div>
              </ClusterValue>
            </ClusterRow>
          )}
        </Cluster>
      </div>
    )
  }
}

export default Restore.connect(Signer)
