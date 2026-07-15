import React from 'react'
import svg from '../../../../../resources/svg'
import { useOriginName } from '../state'

export function ProviderRequest(props: any) {
  const status = props.req.status
  const notice = props.req.notice
  let requestClass = 'signerRequest'
  if (status === 'success') requestClass += ' signerRequestSuccess'
  if (status === 'declined') requestClass += ' signerRequestDeclined'
  if (status === 'pending') requestClass += ' signerRequestPending'
  if (status === 'error') requestClass += ' signerRequestError'
  const originName = props.originName
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
            <div className='requestProvider'>
              <div className={originClass}>{originName}</div>
              <div className='requestProviderSub'>wants to connect</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function ProviderRequestWithState(props: any) {
  const originName = useOriginName(props.req.origin)
  return <ProviderRequest {...props} originName={originName} />
}
