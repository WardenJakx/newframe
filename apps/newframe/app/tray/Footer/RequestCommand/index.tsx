import React from 'react'
import Restore from 'react-restore'

import TxApproval from './TxApproval'

import svg from '../../../../resources/svg'
import link from '../../../../resources/link'

import { toBigInt } from '../../../../resources/utils/numbers'
import { usesBaseFee } from '../../../../resources/domain/transaction'
import { isCancelableRequest, isSignatureRequest } from '../../../../resources/domain/request'

const FEE_WARNING_THRESHOLD_USD = 50

class RequestCommand extends React.Component<any, any> {
  declare store: Store

  constructor(props: any, context?: any) {
    super(props, context)
    this.state = {
      allowInput: false,
      dataView: false,
      signerLocked: false
    }

    setTimeout(() => {
      this.setState({ allowInput: true })
    }, props.signingDelay || 0)
  }

  approve(reqId: any, req: any) {
    link.rpc('approveRequest', req, () => {}) // Move to link.send
  }

  decline(req: any) {
    link.rpc('declineRequest', req, () => {}) // Move to link.send
  }

  ensureAppUnlocked(next: () => void) {
    link.rpc('appLockState', (err: any, appLockState: any) => {
      if (!err && appLockState?.locked) {
        link.emit('action', 'appLockStateChanged')
        return
      }

      next()
    })
  }

  shakeSignerUnavailable() {
    this.setState({ signerLocked: true })
    setTimeout(() => {
      this.setState({ signerLocked: false })
    }, 3000)
  }

  toDisplayUSD(usd: any) {
    // round up to 2 decimal places
    return (Math.ceil(usd * 100) / 100).toFixed(2)
  }

  sentStatus() {
    const { req } = this.props
    const { notice, status } = req
    const chain = {
      type: 'ethereum',
      id: parseInt(req.data.chainId, 'hex' as any)
    }

    const { explorer } = this.store('main.networks', chain.type, chain.id) || {}

    const displayNotice = (notice || '').toLowerCase()
    let displayStatus = (req.status || 'pending').toLowerCase()

    if (displayStatus === 'pending' && displayNotice === 'see signer') {
      displayStatus = 'waiting for device signature'
    } else if (displayStatus === 'verifying') {
      displayStatus = 'waiting for block'
    }

    return (
      <div className='txSubmittedCommand'>
        <div className='requestNoticeInnerText'>{displayStatus}</div>
        <div className={req && req.tx && req.tx.hash ? 'requestFooter requestFooterActive' : 'requestFooter'}>
          <div
            className='txActionButtons'
            onMouseLeave={() => {
              this.setState({ showHashDetails: false })
            }}
          >
            {req && req.tx && req.tx.hash ? (
              this.state.txHashCopied ? (
                <div className='txActionButtonsRow'>
                  <div className={'txActionText'}>Transaction Hash Copied</div>
                </div>
              ) : this.state.showHashDetails || status === 'confirming' || status === 'confirmed' ? (
                <div className='txActionButtonsRow'>
                  <div
                    className={`txActionButton${explorer ? '' : ' txActionButtonDisabled'}`}
                    aria-label='Open transaction explorer'
                    onClick={() => {
                      if (explorer && req && req.tx && req.tx.hash) {
                        if (this.store('main.mute.explorerWarning')) {
                          link.send('tray:openExplorer', chain, req.tx.hash)
                        } else {
                          this.store.notify('openExplorer', { hash: req.tx.hash, chain: chain })
                        }
                      }
                    }}
                  >
                    Open Explorer
                  </div>
                  <div
                    className={'txActionButton'}
                    aria-label='Copy transaction hash'
                    onClick={() => {
                      if (req && req.tx && req.tx.hash) {
                        link.send('tray:copyTxHash', req.tx.hash)
                        this.setState({ txHashCopied: true, showHashDetails: false })
                        setTimeout(() => {
                          this.setState({ txHashCopied: false })
                        }, 3000)
                      }
                    }}
                  >
                    Copy Hash
                  </div>
                </div>
              ) : (
                <div className='txActionButtonsRow'>
                  <div
                    className='txActionButton txActionButtonBad'
                    aria-label='Cancel transaction'
                    onClick={() => {
                      link.send('tray:replaceTx', req.handlerId, 'cancel')
                    }}
                  >
                    Cancel
                  </div>
                  <div
                    className={'txActionButton'}
                    aria-label='View transaction details'
                    onClick={() => {
                      this.setState({ showHashDetails: true })
                    }}
                  >
                    View Details
                  </div>
                  <div
                    className='txActionButton txActionButtonGood'
                    aria-label='Speed up transaction'
                    onClick={() => {
                      link.send('tray:replaceTx', req.handlerId, 'speed')
                    }}
                  >
                    Speed Up
                  </div>
                </div>
              )
            ) : null}
          </div>
        </div>
        {isCancelableRequest(status) && (
          <div className='cancelRequest' onClick={() => this.decline(req)}>
            Cancel
          </div>
        )}
      </div>
    )
  }

  signOrDecline() {
    const { req } = this.props
    const chain = {
      type: 'ethereum',
      id: parseInt(req.data.chainId, 'hex' as any)
    }
    const isTestnet = this.store('main.networks', chain.type, chain.id, 'isTestnet')
    const {
      nativeCurrency,
      nativeCurrency: { symbol: currentSymbol = '?' }
    } = this.store('main.networksMeta', chain.type, chain.id)
    const nativeUSD =
      nativeCurrency && nativeCurrency.usd && !isTestnet ? nativeCurrency.usd.price : undefined
    const hasNativeUSD = typeof nativeUSD === 'number'

    const gasLimit = toBigInt(req.data.gasLimit) ?? 0n
    const maxFeePerGas = toBigInt(usesBaseFee(req.data) ? req.data.maxFeePerGas : req.data.gasPrice) ?? 0n
    const maxFee = maxFeePerGas * gasLimit
    const maxFeeUSD = hasNativeUSD ? (Number(maxFee) / 1e18) * nativeUSD : 0

    return (
      <>
        <div
          className='requestApprove'
          style={{
            position: 'absolute',
            bottom: '8px',
            left: '0px',
            right: '0px'
          }}
        >
          <div
            className='requestDecline'
            aria-label='Decline transaction'
            role='button'
            onClick={() => {
              if (this.state.allowInput) this.decline(req)
            }}
          >
            <div className='requestDeclineButton _txButton _txButtonBad'>
              <span>Decline</span>
            </div>
          </div>
          <div
            className={this.state.signerLocked ? 'requestSign headShake' : 'requestSign'}
            aria-label='Sign transaction'
            role='button'
            onClick={() => {
              if (this.state.allowInput) {
                this.ensureAppUnlocked(() =>
                  link.rpc('signerCompatibility', req.handlerId, (e: any, compatibility: any) => {
                    if (e === 'No signer') {
                      this.store.notify('noSignerWarning', { req })
                    } else if (e === 'Newframe locked') {
                      link.emit('action', 'appLockStateChanged')
                    } else if (e === 'Signer unavailable') {
                      this.shakeSignerUnavailable()
                    } else if (e) {
                      return
                    } else if (
                      !compatibility.compatible &&
                      !this.store('main.mute.signerCompatibilityWarning')
                    ) {
                      this.store.notify('signerCompatibilityWarning', { req, compatibility, chain: chain })
                    } else if (
                      hasNativeUSD &&
                      (maxFeeUSD > FEE_WARNING_THRESHOLD_USD || this.toDisplayUSD(maxFeeUSD) === '0.00') &&
                      !this.store('main.mute.gasFeeWarning')
                    ) {
                      this.store.notify('gasFeeWarning', {
                        req,
                        feeUSD: this.toDisplayUSD(maxFeeUSD),
                        currentSymbol
                      })
                    } else {
                      this.approve(req.handlerId, req)
                    }
                  })
                )
              }
            }}
          >
            <div className='requestSignButton _txButton'>
              {this.state.signerLocked ? (
                <span style={{ display: 'flex' }}>
                  <span>{svg.sign(19)}</span>
                  <span>{svg.lock(13)}</span>
                </span>
              ) : (
                <span>Sign</span>
              )}
            </div>
          </div>
        </div>
      </>
    )
  }

  renderPopBar() {
    const { req } = this.props
    return (
      <div
        className={
          req.automaticFeeUpdateNotice ? 'automaticFeeUpdate automaticFeeUpdateActive' : 'automaticFeeUpdate'
        }
      >
        <div className='txActionButtons'>
          <div className='txActionButtonsRow' style={{ padding: '0px 60px' }}>
            <div className='txActionText'>{'Fee Updated'}</div>
            <div
              className='txActionButton txActionButtonGood'
              onClick={() => {
                link.rpc('removeFeeUpdateNotice', req.handlerId, (e: any) => {
                  if (e) console.error(e)
                })
              }}
            >
              {'Ok'}
            </div>
          </div>
        </div>
      </div>
    )
  }

  renderTxCommand() {
    const { req } = this.props
    const { notice, status, mode } = req

    const showWarning = !status && mode !== 'monitor'
    const requiredApproval = showWarning && (req.approvals || []).filter((a: any) => !a.approved)[0]

    if (requiredApproval) {
      return (
        <div className='requestNotice requestNoticeApproval'>
          <div className='requestNoticeInner requestNoticeInnerApproval'>
            <TxApproval req={this.props.req} approval={requiredApproval} />
          </div>
        </div>
      )
    } else {
      return (
        <div
          className={notice ? 'requestNotice requestNoticeSubmitted' : 'requestNotice requestNoticeSigning'}
        >
          <div className='requestNoticeInner'>
            {!notice && this.renderPopBar()}
            {notice ? this.sentStatus() : this.signOrDecline()}
          </div>
        </div>
      )
    }
  }

  renderSignDataCommand() {
    const { req } = this.props
    const { status, notice } = req

    return (
      <div>
        {notice ? (
          <div key={notice + status} className='requestNotice'>
            {(() => {
              if (status === 'pending') {
                return (
                  <div key={status} className='requestNoticeInner'>
                    <div style={{ paddingBottom: 20 }}>
                      <div className='loader' />
                    </div>
                    <div className='requestNoticeInnerText'>See Signer</div>
                    <div className='cancelRequest' onClick={() => this.decline(req)}>
                      Cancel
                    </div>
                  </div>
                )
              } else if (status === 'success') {
                return (
                  <div key={status} className='requestNoticeInner requestNoticeSuccess'>
                    <div className='requestNoticeInnerSymbol'>{svg.octicon('check', { height: 40 })}</div>
                    <div className='requestNoticeInnerText'>{notice}</div>
                  </div>
                )
              } else if (status === 'error' || status === 'declined') {
                return (
                  <div key={status} className='requestNoticeInner requestNoticeError'>
                    <div className='requestNoticeInnerSymbol'>
                      {svg.octicon('circle-slash', { height: 40 })}
                    </div>
                    <div className='requestNoticeInnerText'>{notice}</div>
                  </div>
                )
              } else {
                return (
                  <div key={notice} className='requestNoticeInner'>
                    <div className='requestNoticeInnerText'>{notice}</div>
                  </div>
                )
              }
            })()}
          </div>
        ) : (
          <div className='requestApprove'>
            <div
              className='requestDecline'
              style={{ pointerEvents: this.state.allowInput ? 'auto' : 'none' }}
              onClick={() => {
                if (this.state.allowInput) this.decline(req)
              }}
            >
              <div className='requestDeclineButton _txButton _txButtonBad'>
                <span>Decline</span>
              </div>
            </div>
            <div
              className='requestSign'
              style={{ pointerEvents: this.state.allowInput ? 'auto' : 'none' }}
              onClick={() => {
                if (this.state.allowInput) {
                  this.ensureAppUnlocked(() =>
                    link.rpc('signerCompatibility', req.handlerId, (e: any) => {
                      if (e === 'No signer') {
                        this.store.notify('noSignerWarning', { req })
                      } else if (e === 'Newframe locked') {
                        link.emit('action', 'appLockStateChanged')
                      } else if (e === 'Signer unavailable') {
                        this.shakeSignerUnavailable()
                      } else if (e) {
                        return
                      } else {
                        this.approve(req.handlerId, req)
                      }
                    })
                  )
                }
              }}
            >
              <div className='requestSignButton _txButton'>
                <span>Sign</span>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  override render() {
    const { req } = this.props
    if (!req) return null
    const crumb = this.store('windows.panel.nav')[0] || {}

    if (req.type === 'transaction' && crumb.data.step === 'confirm') {
      return this.renderTxCommand()
    } else if (isSignatureRequest(req)) {
      return this.renderSignDataCommand()
    } else {
      return null
    }
  }
}

export default Restore.connect(RequestCommand)
