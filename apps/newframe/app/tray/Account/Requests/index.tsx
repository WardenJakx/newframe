import React from 'react'

import TxOverview from './TransactionRequest/TxMainNew/overview'

import RequestItem from '../../../../resources/Components/RequestItem'

import { ClusterBox, Cluster } from '../../../../resources/Components/Cluster'

import link from '../../../../resources/link'
import svg from '../../../../resources/svg'
import { useAccountRequests, useEthereumNetworkMetadata, useEthereumNetworks, useOrigins } from './state'

export function Requests(props: any) {
  const renderRequestGroup = (origin: any, requests: any) => {
    const groupName = props.origins[origin]?.name || origin
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
              void link.executeCommand({
                type: 'request.clear-origin',
                accountId: props.account,
                originId: origin
              })
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
                  account={props.account}
                  handlerId={req.handlerId}
                  i={i}
                  title={'Account Access'}
                  color={'var(--color-text-primary)'}
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
                  account={props.account}
                  handlerId={req.handlerId}
                  i={i}
                  title={'Sign Message'}
                  color={'var(--color-text-primary)'}
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
                  account={props.account}
                  handlerId={req.handlerId}
                  i={i}
                  title={'Sign Data'}
                  color={'var(--color-text-primary)'}
                  svgName={'sign'}
                >
                  <div style={{ height: '10px' }} />
                </RequestItem>
              )
            } else if (req.type === 'signErc20Permit') {
              const chainId = req.typedMessage.data.domain.chainId
              const chainName = props.networks[chainId]?.name
              const { primaryColor, icon } = props.networkMetadata[chainId] || {}

              return (
                <RequestItem
                  key={req.type + i}
                  req={req}
                  account={props.account}
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
                  account={props.account}
                  handlerId={req.handlerId}
                  i={i}
                  title={'Add Chain'}
                  color={'var(--color-text-primary)'}
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
                  account={props.account}
                  handlerId={req.handlerId}
                  i={i}
                  title={'Switch Chain'}
                  color={'var(--color-text-primary)'}
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
                  account={props.account}
                  handlerId={req.handlerId}
                  i={i}
                  title={'Add Tokens'}
                  color={'var(--color-text-primary)'}
                  svgName={'tokens'}
                >
                  <div style={{ height: '10px' }} />
                </RequestItem>
              )
            } else if (req.type === 'transaction') {
              const chainId = parseInt(req.data.chainId, 16)
              const chainName = props.networks[chainId]?.name
              const {
                primaryColor,
                icon,
                nativeCurrency: { symbol: currentSymbol = '?' } = {}
              } = props.networkMetadata[chainId] || {}
              const originName = props.origins[req.origin]?.name || req.origin
              return (
                <RequestItem
                  key={req.type + i}
                  req={req}
                  account={props.account}
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

  const requests = Object.values(props.accountRequests).sort((a: any, b: any) => {
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
          return renderRequestGroup(origin, originSortedRequests[origin])
        })
      )}
    </div>
  )
}

export default function RequestsWithState(props: any) {
  const accountRequests = useAccountRequests(props.account)
  const networks = useEthereumNetworks()
  const networkMetadata = useEthereumNetworkMetadata()
  const origins = useOrigins()
  return (
    <Requests
      {...props}
      accountRequests={accountRequests}
      networks={networks}
      networkMetadata={networkMetadata}
      origins={origins}
    />
  )
}
