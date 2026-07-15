import React from 'react'
import svg from '../../../../../resources/svg'
import { useOriginName } from '../state'
import type { AddTokenRequest as AddTokenAccountRequest } from '../../../../../main/accounts/types'

type AddTokenRequestProps = {
  req: AddTokenAccountRequest & { id?: string }
  originName: string
  pos?: number
}

type AddTokenRequestWithStateProps = Omit<AddTokenRequestProps, 'originName'>

export function AddTokenRequest(props: AddTokenRequestProps) {
  const status = props.req.status
  const notice = props.req.notice

  let requestClass = 'signerRequest'
  if (status === 'success') requestClass += ' signerRequestSuccess'
  if (status === 'declined') requestClass += ' signerRequestDeclined'
  if (status === 'pending') requestClass += ' signerRequestPending'
  if (status === 'error') requestClass += ' signerRequestError'

  const originName = props.originName
  let originClass = 'requestTokenOrigin'
  if (originName.length > 28) originClass = 'requestTokenOrigin requestTokenOrigin18'
  if (originName.length > 36) originClass = 'requestTokenOrigin requestTokenOrigin12'

  const mode = props.req.mode
  const height = mode === 'monitor' ? '80px' : '340px'
  const token = props.req.token
  return (
    <div
      key={props.req.id || props.req.handlerId}
      className={requestClass}
      style={{ transform: `translateY(${props.pos || 0}px)`, height }}
    >
      <div className='approveRequest'>
        {notice ? (
          <div className='requestNotice'>
            {(() => {
              if (status === 'pending') {
                return (
                  <div className='requestNoticeInner scaleIn'>
                    <div>
                      <div className='loader' />
                    </div>
                  </div>
                )
              } else if (status === 'success') {
                return (
                  <div className='requestNoticeInner scaleIn'>{svg.octicon('check', { height: 80 })}</div>
                )
              } else if (status === 'error' || status === 'declined') {
                return (
                  <div className='requestNoticeInner scaleIn'>
                    {svg.octicon('circle-slash', { height: 80 })}
                  </div>
                )
              }
            })()}
          </div>
        ) : (
          <div className='approveTransactionPayload'>
            {
              <div className='approveRequestHeader approveTransactionHeader'>
                <div className='approveRequestHeaderIcon'> {svg.octicon('shield', { height: 20 })}</div>
                <div className='approveRequestHeaderLabel'> Add Token</div>
              </div>
            }
            <div className='requestToken scaleIn'>
              <div className='requestTokenInner'>
                <div className={originClass}>{originName}</div>
                <div className={'requestTokenOriginSub'}>{'wants to add a token'}</div>
                <div className='requestTokenInfo'>
                  <div className='requestTokenSymbol'>{token.symbol.toUpperCase()}</div>
                  <div className='requestTokenName'>{token.name}</div>
                  <div className='requestTokenAddress'>{token.address}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function AddTokenRequestWithState(props: AddTokenRequestWithStateProps) {
  const originName = useOriginName(props.req.origin)
  return <AddTokenRequest {...props} originName={originName} />
}
