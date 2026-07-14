import React from 'react'
import { useShallow } from 'zustand/react/shallow'

import link from '../../../resources/link'
import { isHardwareSigner } from '../../../resources/domain/signer'
import { isSignatureRequest } from '../../../resources/domain/request'
import { useWalletSelector } from '../../state/useAppSelector'
import type { WalletRendererState } from '../../../resources/state/projections'
import { useRequestView, type RequestViewStep } from '../requestView'

import RequestCommand from './RequestCommand'

const FOOTER_HEIGHT_PROPERTY = '--tray-footer-height'
const MINIMUM_FOOTER_HEIGHT = 40

interface FooterSharedState {
  account?: WalletRendererState['accounts'][string]
  crumb: any
  req?: any
}

interface FooterProps {
  shared: FooterSharedState
  step: RequestViewStep
}

const EMPTY_CRUMB = {}

const selectFooterState = (state: WalletRendererState): FooterSharedState => {
  const crumb = state.windows.panel.nav[0] || EMPTY_CRUMB
  const accountId = crumb.data?.accountId
  const requestId = crumb.data?.requestId
  const account = accountId ? state.accounts[accountId] : undefined

  return {
    account,
    crumb,
    req: requestId ? account?.requests[requestId] : undefined
  }
}

export class Footer extends React.Component<FooterProps, any> {
  footerRef = React.createRef<HTMLDivElement>()
  observer?: ResizeObserver

  constructor(props: FooterProps, context?: any) {
    super(props, context)
    this.state = {
      allowInput: true
    }
  }

  updateFooterHeight = () => {
    const height = Math.max(MINIMUM_FOOTER_HEIGHT, this.footerRef.current?.clientHeight || 0)
    document.documentElement.style.setProperty(FOOTER_HEIGHT_PROPERTY, `${height}px`)
  }

  override componentDidMount() {
    this.updateFooterHeight()
    if (typeof ResizeObserver === 'undefined' || !this.footerRef.current) return

    this.observer = new ResizeObserver(this.updateFooterHeight)
    this.observer.observe(this.footerRef.current)
  }

  override componentWillUnmount() {
    this.observer?.disconnect()
    document.documentElement.style.removeProperty(FOOTER_HEIGHT_PROPERTY)
  }

  rejectRequest(req: { handlerId: string }) {
    if (this.state.allowInput) {
      void link.executeCommand({ type: 'request.reject', requestId: req.handlerId })
    }
  }
  renderFooter() {
    const { account, crumb, req } = this.props.shared

    if (crumb.view === 'requestView') {
      if (req && account) {
        if (req.type === 'transaction' && this.props.step === 'confirm') {
          return (
            <RequestCommand req={req} signingDelay={isHardwareSigner(account.lastSignerType) ? 0 : 1500} />
          )
        } else if (req.type === 'access') {
          return (
            <div className='requestApprove'>
              <div
                className='requestDecline'
                style={{ pointerEvents: this.state.allowInput ? 'auto' : 'none' }}
                onClick={() => {
                  if (this.state.allowInput) {
                    void link.executeCommand({
                      type: 'request.access-resolve',
                      requestId: req.handlerId,
                      approved: false
                    })
                  }
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
                    void link.executeCommand({
                      type: 'request.access-resolve',
                      requestId: req.handlerId,
                      approved: true
                    })
                  }
                }}
              >
                <div className='requestSignButton _txButton'>
                  <span>Approve</span>
                </div>
              </div>
            </div>
          )
        } else if (isSignatureRequest(req) && this.props.step === 'confirm') {
          return (
            <RequestCommand req={req} signingDelay={isHardwareSigner(account.lastSignerType) ? 0 : 1500} />
          )
        } else if (req.type === 'addChain' || req.type === 'switchChain') {
          return req.type === 'switchChain' ? (
            <div className='requestApprove'>
              <div
                className='requestDecline'
                style={{ pointerEvents: this.state.allowInput ? 'auto' : 'none' }}
                onClick={() => {
                  if (this.state.allowInput) {
                    void link.executeCommand({
                      type: 'request.switch-chain-resolve',
                      requestId: req.handlerId,
                      approved: false
                    })
                  }
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
                    void link.executeCommand({
                      type: 'request.switch-chain-resolve',
                      requestId: req.handlerId,
                      approved: true
                    })
                  }
                }}
              >
                <div className='requestSignButton _txButton'>
                  <span>Switch</span>
                </div>
              </div>
            </div>
          ) : (
            <div className='requestApprove'>
              <div
                className='requestDecline'
                style={{ pointerEvents: this.state.allowInput ? 'auto' : 'none' }}
                onClick={() => {
                  this.rejectRequest(req)
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
                    void link.executeCommand({
                      type: 'request.add-chain-review',
                      requestId: req.handlerId
                    })
                  }
                }}
              >
                <div className='requestSignButton _txButton'>
                  <span>Review</span>
                </div>
              </div>
            </div>
          )
        } else if (req.type === 'addToken') {
          return (
            <div className='requestApprove'>
              <div
                className='requestDecline'
                style={{ pointerEvents: this.state.allowInput ? 'auto' : 'none' }}
                onClick={() => {
                  this.rejectRequest(req)
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
                    void link.executeCommand({
                      type: 'request.add-token-review',
                      requestId: req.handlerId
                    })
                  }
                }}
              >
                <div className='requestSignButton _txButton'>
                  <span>Review</span>
                </div>
              </div>
            </div>
          )
        } else {
          return null
        }
      }
    }
  }
  override render() {
    return (
      <div ref={this.footerRef} className='footerModule'>
        <div className='footerWrap'>{this.renderFooter()}</div>
      </div>
    )
  }
}

export default function FooterContainer() {
  const shared = useWalletSelector(useShallow(selectFooterState))
  const { step } = useRequestView()
  return <Footer shared={shared} step={step} />
}
