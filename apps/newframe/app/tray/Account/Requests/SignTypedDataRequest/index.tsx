import React from 'react'

import { SimpleTypedData as TypedSignatureOverview } from '../../../../../resources/Components/SimpleTypedData'
import { getSignatureRequestClass } from '../../../../../resources/domain/request'
import { useOriginName } from '../state'

export function TransactionRequest(props: any) {
  const { req, originName } = props
  const requestClass = getSignatureRequestClass(req)

  return (
    <div key={req.id || req.handlerId} className={requestClass}>
      <TypedSignatureOverview {...{ originName, req }} />
    </div>
  )
}

export default function TransactionRequestWithState(props: any) {
  const originName = useOriginName(props.req.origin)
  return <TransactionRequest {...props} originName={originName} />
}
