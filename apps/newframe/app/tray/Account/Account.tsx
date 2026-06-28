import React from 'react'
import Restore from 'react-restore'

import svg from '../../../resources/svg'
import link from '../../../resources/link'

import Requests from './Requests'

// move
import ProviderRequest from './Requests/ProviderRequest'
import TransactionRequest from './Requests/TransactionRequest'
import SignatureRequest from './Requests/SignatureRequest'
import ChainRequest from './Requests/ChainRequest'
import AddTokenRequest from './Requests/AddTokenRequest'
import SignTypedDataRequest from './Requests/SignTypedDataRequest'
import SignPermitRequest from './Requests/SignPermitRequest'
import { isHardwareSigner } from '../../../resources/domain/signer'
import { accountViewTitles } from '../../../resources/domain/request'

const requests: Record<string, any> = {
  sign: SignatureRequest,
  signTypedData: SignTypedDataRequest,
  signErc20Permit: SignPermitRequest,
  transaction: TransactionRequest,
  access: ProviderRequest,
  addChain: ChainRequest,
  addToken: AddTokenRequest
}

// AccountView is a reusable template that provides the option to nav back to main
class _AccountView extends React.Component<any, any> {
  declare store: Store

  override render() {
    const accountOpen = this.store('selected.open')
    const footerHeight = this.store('windows.panel.footer.height')
    return (
      <div
        className='accountView'
        style={{ top: accountOpen ? '140px' : '80px', bottom: footerHeight + 'px' }}
      >
        <div className='accountViewMenu cardShow'>
          <div className='accountViewBack' onClick={() => this.props.back()}>
            {svg.chevronLeft(16)}
          </div>
          <div className='accountViewTitle'>
            <div className='accountViewIcon'>{this.props.accountViewIcon}</div>
            <div className='accountViewText'>{this.props.accountViewTitle}</div>
          </div>
        </div>
        <div className='accountViewMain cardShow'>{this.props.children}</div>
      </div>
    )
  }
}

const AccountView = Restore.connect(_AccountView)

class _AccountBody extends React.Component<any, any> {
  declare store: Store

  getRequestComponent({ type }: any) {
    return requests[type]
  }

  getChainData(req: any) {
    if (req.type !== 'signErc20Permit') return {}
    const chainId = req.typedMessage.data.domain.chainId
    const chainName = this.store('main.networks.ethereum', chainId, 'name')
    const { primaryColor: chainColor, icon } = this.store('main.networksMeta.ethereum', chainId)

    return { chainId, chainName, chainColor, icon }
  }

  renderRequest(req: any, data: any = {}) {
    const Request = this.getRequestComponent(req)
    if (!Request) return null

    const { handlerId } = req
    const { step } = data

    const activeAccount = this.store('main.accounts', this.props.id)
    const originName = this.store('main.origins', req.origin, 'name')
    const chainData = this.getChainData(req)

    const signingDelay = isHardwareSigner(activeAccount.lastSignerType) ? 200 : 1500

    return (
      <Request
        key={handlerId}
        req={req}
        step={step}
        signingDelay={signingDelay}
        chainId={chainData.chainId}
        originName={originName}
        chainData={chainData}
      />
    )
  }

  getAccountViewTitle({ type }: any) {
    return (accountViewTitles as any)[type]
  }

  override render() {
    const crumb = this.store('windows.panel.nav')[0] || {}

    if (crumb.view === 'requestView') {
      const { accountId, requestId } = crumb.data
      const req = this.store('main.accounts', accountId, 'requests', requestId)
      const accountViewTitle = (req && this.getAccountViewTitle(req)) || ''

      return (
        <AccountView
          back={() => {
            link.send('nav:back', 'panel')
          }}
          {...this.props}
          accountViewTitle={accountViewTitle}
        >
          {req && this.renderRequest(req, crumb.data)}
        </AccountView>
      )
    } else if (crumb.view === 'expandedModule') {
      if (crumb.data?.id !== 'requests') return null

      return (
        <AccountView
          back={() => {
            link.send('nav:back', 'panel')
          }}
          {...this.props}
          accountViewTitle={crumb.data.id}
        >
          <div className='accountsModuleExpand cardShow'>
            <div
              className='moduleExpanded'
              onMouseDown={(e) => {
                e.stopPropagation()
              }}
            >
              <Requests expanded={true} account={crumb.data.account} moduleId='requests' />
            </div>
          </div>
        </AccountView>
      )
    } else {
      return null
    }
  }
}

const AccountBody = Restore.connect(_AccountBody)

class Account extends React.Component<any, any> {
  declare store: Store

  override render() {
    const minimized = this.store('selected.minimized')

    return (
      <AccountBody
        id={this.props.id}
        addresses={this.props.addresses}
        minimized={minimized}
        status={this.props.status}
        signer={this.props.signer}
      />
    )
  }
}

export default Restore.connect(Account)
