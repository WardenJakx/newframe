import React from 'react'
import svg from '../../../../../resources/svg'
import { useNetwork, useOriginName } from '../state'
import type { AccountRequest } from '../../../../../main/accounts/types'

type ChainRequestData = AccountRequest<'addChain' | 'switchChain'> & {
  id?: string
  chain: {
    id: string | number
    type: string
    name?: string
  }
}

type ChainRequestProps = {
  req: ChainRequestData
  originName: string
  networkName?: string
}

type ChainRequestWithStateProps = Omit<ChainRequestProps, 'originName' | 'networkName'>

export function ChainRequest(props: ChainRequestProps) {
  const { status, notice, type, chain } = props.req

  let requestClass = 'signerRequest'
  if (status === 'success') requestClass += ' signerRequestSuccess'
  if (status === 'declined') requestClass += ' signerRequestDeclined'
  if (status === 'pending') requestClass += ' signerRequestPending'
  if (status === 'error') requestClass += ' signerRequestError'

  const { originName, networkName } = props
  let originClass = 'requestProviderOrigin'
  if (originName.length > 28) originClass = 'requestProviderOrigin requestProviderOrigin18'
  if (originName.length > 36) originClass = 'requestProviderOrigin requestProviderOrigin12'
  return (
    <div key={props.req.id || props.req.handlerId} className={requestClass}>
      <div className='approveRequest'>
        {notice ? (
          <div className='requestNotice'>
            {status === 'pending' ? (
              <div className='requestNoticeInner'>
                <div>
                  <div className='loader' />
                </div>
              </div>
            ) : status === 'success' ? (
              <div className='requestNoticeInner'>{svg.octicon('check', { height: 80 })}</div>
            ) : status === 'error' || status === 'declined' ? (
              <div className='requestNoticeInner'>{svg.octicon('circle-slash', { height: 80 })}</div>
            ) : null}
          </div>
        ) : (
          <div className='approveTransactionPayload'>
            <div className='requestChainInner'>
              <div className={originClass}>{originName}</div>
              <div className={'requestChainOriginSub'}>
                {type === 'switchChain' ? 'wants to switch to chain' : 'wants to add chain'}
              </div>
              <div className='requestChainName'>
                {type === 'switchChain' ? networkName : chain.name || ''}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function ChainRequestWithState(props: ChainRequestWithStateProps) {
  const { req } = props
  const originName = useOriginName(req.origin)
  const network = useNetwork(req.chain.type, Number(req.chain.id))
  return <ChainRequest {...props} originName={originName} networkName={network.name || ''} />
}
