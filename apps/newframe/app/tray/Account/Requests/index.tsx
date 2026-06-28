import React from 'react'
import Restore from 'react-restore'

import TxOverview from './TransactionRequest/TxMainNew/overview'

import RequestItem from '../../../../resources/Components/RequestItem'

import { ClusterBox, Cluster } from '../../../../resources/Components/Cluster'

import link from '../../../../resources/link'
import svg from '../../../../resources/svg'

class Requests extends React.Component<any, any> {
  declare store: Store

  renderRequestGroup(origin: any, requests: any) {
    const groupName = this.store('main.origins', origin, 'name')
    // const favicon = `https://s2.googleusercontent.com/s2/favicons?sz=256&domain_url=https://` + groupName

    return (
      <ClusterBox key={origin}>
        <div className='requestGroup'>
          {/* <img src={proxyFavicon} width='24px' height='24px' />
          <RingIcon img={favicon} alt={'?'} small noRing /> */}
          <div className='requestGroupMain'>
            <div style={{ marginRight: '8px' }}>{svg.window(12)}</div>
            <div className='requestGroupName'>{groupName}</div>
          </div>
          <div
            className='requestGroupButton'
            onClick={() => {
              link.send('tray:clearRequestsByOrigin', this.props.account, origin)
            }}
          >
            {svg.x(14)}
            <div className='requestGroupButtonLabel'>{'clear all'}</div>
          </div>
        </div>
        <Cluster>
          {!requests.length ? (
            <div key='noReq' className='noRequests'>
              No Pending Requests
            </div>
          ) : null}
          {requests.map((req: any, i: number) => {
            if (req.type === 'access') {
              return (
                <RequestItem
                  key={req.type + i}
                  req={req}
                  account={this.props.account}
                  handlerId={req.handlerId}
                  i={i}
                  title={'Account Access'}
                  color={'var(--outerspace)'}
                  svgName={'accounts'}
                >
                  <div style={{ height: '10px' }} />
                </RequestItem>
              )
            } else if (req.type === 'sign') {
              return (
                <RequestItem
                  key={req.type + i}
                  req={req}
                  account={this.props.account}
                  handlerId={req.handlerId}
                  i={i}
                  title={'Sign Message'}
                  color={'var(--outerspace)'}
                  svgName={'sign'}
                >
                  <div style={{ height: '10px' }} />
                </RequestItem>
              )
            } else if (req.type === 'signTypedData') {
              return (
                <RequestItem
                  key={req.type + i}
                  req={req}
                  account={this.props.account}
                  handlerId={req.handlerId}
                  i={i}
                  title={'Sign Data'}
                  color={'var(--outerspace)'}
                  svgName={'sign'}
                >
                  <div style={{ height: '10px' }} />
                </RequestItem>
              )
            } else if (req.type === 'signErc20Permit') {
              const chainId = req.typedMessage.data.domain.chainId
              const chainName = this.store('main.networks.ethereum', chainId, 'name')
              const { primaryColor, icon } = this.store('main.networksMeta.ethereum', chainId)

              return (
                <RequestItem
                  key={req.type + i}
                  req={req}
                  account={this.props.account}
                  handlerId={req.handlerId}
                  i={i}
                  title={`${chainName} Token Permit`}
                  color={primaryColor ? `var(--${primaryColor})` : ''}
                  img={icon}
                >
                  <div style={{ height: '10px' }} />
                </RequestItem>
              )
            } else if (req.type === 'addChain') {
              return (
                <RequestItem
                  key={req.type + i}
                  req={req}
                  account={this.props.account}
                  handlerId={req.handlerId}
                  i={i}
                  title={'Add Chain'}
                  color={'var(--outerspace)'}
                  svgName={'chain'}
                >
                  <div style={{ height: '10px' }} />
                </RequestItem>
              )
            } else if (req.type === 'switchChain') {
              return (
                <RequestItem
                  key={req.type + i}
                  req={req}
                  account={this.props.account}
                  handlerId={req.handlerId}
                  i={i}
                  title={'Switch Chain'}
                  color={'var(--outerspace)'}
                  svgName={'chain'}
                >
                  <div style={{ height: '10px' }} />
                </RequestItem>
              )
            } else if (req.type === 'addToken') {
              return (
                <RequestItem
                  key={req.type + i}
                  req={req}
                  account={this.props.account}
                  handlerId={req.handlerId}
                  i={i}
                  title={'Add Tokens'}
                  color={'var(--outerspace)'}
                  svgName={'tokens'}
                >
                  <div style={{ height: '10px' }} />
                </RequestItem>
              )
            } else if (req.type === 'transaction') {
              const chainId = parseInt(req.data.chainId, 16)
              const chainName = this.store('main.networks.ethereum', chainId, 'name')
              const {
                primaryColor,
                icon,
                nativeCurrency: { symbol: currentSymbol = '?' }
              } = this.store('main.networksMeta.ethereum', chainId)
              const originName = this.store('main.origins', req.origin, 'name')
              return (
                <RequestItem
                  key={req.type + i}
                  req={req}
                  account={this.props.account}
                  handlerId={req.handlerId}
                  i={i}
                  title={`${chainName} Transaction`}
                  color={primaryColor ? `var(--${primaryColor})` : ''}
                  img={icon}
                >
                  <TxOverview
                    req={req}
                    chainName={chainName}
                    chainColor={primaryColor}
                    symbol={currentSymbol}
                    originName={originName}
                    simple={true}
                  />
                </RequestItem>
              )
            }
          })}
        </Cluster>
      </ClusterBox>
    )
  }

  renderExpanded() {
    const activeAccount = this.store('main.accounts', this.props.account)
    const requests = Object.values(activeAccount.requests || {}).sort((a: any, b: any) => {
      if (a.created > b.created) return -1
      if (a.created < b.created) return 1
      return 0
    })

    const originSortedRequests: any = {}
    requests.forEach((req: any) => {
      const origin = req.origin
      originSortedRequests[origin] = originSortedRequests[origin] || []
      originSortedRequests[origin].push(req)
    })
    const groups = Object.keys(originSortedRequests)

    return (
      <div className='accountViewScroll' style={{ paddingTop: '40px' }}>
        {groups.length === 0 ? (
          <div className='requestContainerWrap'>
            <div className='requestContainerEmpty'>{'NO PENDING REQUESTS'}</div>
          </div>
        ) : (
          groups.map((origin) => {
            return this.renderRequestGroup(origin, originSortedRequests[origin])
          })
        )}
      </div>
    )
  }
  override render() {
    return this.renderExpanded()
  }
}

export default Restore.connect(Requests)
