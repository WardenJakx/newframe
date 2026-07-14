import React from 'react'
import { useShallow } from 'zustand/react/shallow'

import TxApproval from './TxApproval'

import svg from '../../../../resources/svg'
import link from '../../../../resources/link'

import { toBigInt } from '../../../../resources/utils/numbers'
import { usesBaseFee } from '../../../../resources/domain/transaction'
import { isCancelableRequest, isSignatureRequest } from '../../../../resources/domain/request'
import { useWalletSelector } from '../../../state/useAppSelector'
import type { WalletRendererState } from '../../../../resources/state/projections'
import { useTrayNotification, type TrayNotifier } from '../../notification'
import { useRequestView, type RequestViewStep } from '../../requestView'

const FEE_WARNING_THRESHOLD_USD = 50
type RequestReference = { handlerId: string }
type SignerCompatibility = { signer: string; tx: string; compatible: boolean }

interface RequestCommandSharedState {
  appLocked: boolean
  chain: any
  chainMeta: any
  explorerWarningMuted: boolean
  gasFeeWarningMuted: boolean
  signerCompatibilityWarningMuted: boolean
  step: RequestViewStep
}

interface RequestCommandProps {
  notify: TrayNotifier
  req: any
  shared: RequestCommandSharedState
  signingDelay?: number
}

const EMPTY_CHAIN = {}
const EMPTY_CHAIN_META = { nativeCurrency: {} }

export class RequestCommand extends React.Component<RequestCommandProps, any> {
  private allowInputTimer?: ReturnType<typeof setTimeout>

  constructor(props: RequestCommandProps, context?: any) {
    super(props, context)
    this.state = {
      allowInput: false,
      dataView: false,
      signerLocked: false
    }
  }

  override componentDidMount() {
    this.allowInputTimer = setTimeout(() => {
      this.setState({ allowInput: true })
    }, this.props.signingDelay || 0)
  }

  override componentWillUnmount() {
    if (this.allowInputTimer !== undefined) clearTimeout(this.allowInputTimer)
  }

  approve(requestId: string) {
    void link.executeCommand({ type: 'request.approve', requestId })
  }

  decline(req: RequestReference) {
    void link.executeCommand({ type: 'request.reject', requestId: req.handlerId })
  }

  ensureAppUnlocked(next: () => void) {
    if (!this.props.shared.appLocked) next()
  }

  shakeSignerUnavailable() {
    this.setState({ signerLocked: true })
    setTimeout(() => {
      this.setState({ signerLocked: false })
    }, 3000)
  }

  async withSignerCompatibility(req: RequestReference, next: (compatibility: SignerCompatibility) => void) {
    const result = await link.executeQuery({
      type: 'request.signer-compatibility',
      requestId: req.handlerId
    })

    if (!result.ok) {
      if (result.error === 'no_signer') this.props.notify('noSignerWarning', { req })
      else if (result.error === 'signer_unavailable') {
        const recovery = await link.executeCommand({
          type: 'request.signer-recovery-open',
          requestId: req.handlerId
        })
        if (!recovery.ok) this.shakeSignerUnavailable()
      }
      return
    }

    next(result.compatibility)
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

    const { explorer } = this.props.shared.chain

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
                        if (this.props.shared.explorerWarningMuted) {
                          void link.executeCommand({
                            type: 'explorer.open',
                            chainId: chain.id,
                            transactionHash: req.tx.hash
                          })
                        } else {
                          this.props.notify('openExplorer', { hash: req.tx.hash, chain })
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
                        void link.executeCommand({ type: 'clipboard.write', text: req.tx.hash })
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
                      void link.executeCommand({
                        type: 'transaction.replace',
                        requestId: req.handlerId,
                        replacement: 'cancel',
                        idempotencyKey: crypto.randomUUID()
                      })
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
                      void link.executeCommand({
                        type: 'transaction.replace',
                        requestId: req.handlerId,
                        replacement: 'speed',
                        idempotencyKey: crypto.randomUUID()
                      })
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
    const isTestnet = this.props.shared.chain.isTestnet
    const {
      nativeCurrency,
      nativeCurrency: { symbol: currentSymbol = '?' }
    } = this.props.shared.chainMeta
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
                this.ensureAppUnlocked(
                  () =>
                    void this.withSignerCompatibility(req, (compatibility) => {
                      if (!compatibility.compatible && !this.props.shared.signerCompatibilityWarningMuted) {
                        this.props.notify('signerCompatibilityWarning', { req, compatibility, chain })
                      } else if (
                        hasNativeUSD &&
                        (maxFeeUSD > FEE_WARNING_THRESHOLD_USD || this.toDisplayUSD(maxFeeUSD) === '0.00') &&
                        !this.props.shared.gasFeeWarningMuted
                      ) {
                        this.props.notify('gasFeeWarning', {
                          req,
                          feeUSD: this.toDisplayUSD(maxFeeUSD),
                          currentSymbol
                        })
                      } else {
                        this.approve(req.handlerId)
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
                void link.executeCommand({
                  type: 'transaction.fee-notice-dismiss',
                  requestId: req.handlerId
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
                  this.ensureAppUnlocked(
                    () =>
                      void this.withSignerCompatibility(req, () => {
                        this.approve(req.handlerId)
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
    if (req.type === 'transaction' && this.props.shared.step === 'confirm') {
      return this.renderTxCommand()
    } else if (isSignatureRequest(req)) {
      return this.renderSignDataCommand()
    } else {
      return null
    }
  }
}

export default function RequestCommandContainer(props: Omit<RequestCommandProps, 'notify' | 'shared'>) {
  const chainId = parseInt(props.req?.data?.chainId || '0', 16)
  const { notify } = useTrayNotification()
  const { step } = useRequestView()
  const selector = React.useMemo(
    () =>
      (state: WalletRendererState): Omit<RequestCommandSharedState, 'step'> => {
        const mute = state.mute

        return {
          appLocked: state.appLock.locked,
          chain: state.networks.ethereum[chainId] || EMPTY_CHAIN,
          chainMeta: state.networksMeta.ethereum[chainId] || EMPTY_CHAIN_META,
          explorerWarningMuted: !!mute?.explorerWarning,
          gasFeeWarningMuted: !!mute?.gasFeeWarning,
          signerCompatibilityWarningMuted: !!mute?.signerCompatibilityWarning
        }
      },
    [chainId]
  )
  const synchronized = useWalletSelector(useShallow(selector))

  return <RequestCommand {...props} notify={notify} shared={{ ...synchronized, step }} />
}
