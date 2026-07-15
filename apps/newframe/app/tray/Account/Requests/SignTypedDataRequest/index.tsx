import React from 'react'

import { SimpleTypedData as TypedSignatureOverview } from '../../../../../resources/Components/SimpleTypedData'
import { getSignatureRequestClass } from '../../../../../resources/domain/request'
import { useOriginName } from '../state'
import type { SignTypedDataRequest } from '../../../../../main/accounts/types'

type TransactionRequestProps = {
  req: SignTypedDataRequest & { id?: string }
  originName: string
}

type TransactionRequestWithStateProps = Omit<TransactionRequestProps, 'originName'>

export function TransactionRequest(props: TransactionRequestProps) {
  const { req, originName } = props
  const requestClass = getSignatureRequestClass(req)

  return (
    <div key={req.id || req.handlerId} className={requestClass}>
      <TypedSignatureOverview {...{ originName, req }} />
    </div>
  )
}

export default function TransactionRequestWithState(props: TransactionRequestWithStateProps) {
  const originName = useOriginName(props.req.origin)
  return <TransactionRequest {...props} originName={originName} />
}
