import React from 'react'

import { SimpleTypedData as TypedSignatureOverview } from '../../../../../resources/Components/SimpleTypedData'
import { getSignatureRequestClass } from '../../../../../resources/domain/request'
import { useOriginName } from '../state'

export class TransactionRequest extends React.Component<any, any> {
  constructor(props: any, context?: any) {
    super(props, context)
    this.state = { allowInput: false, dataView: false }

    setTimeout(
      () => {
        this.setState({ allowInput: true })
      },
      (props || {}).signingDelay || 1500
    )
  }

  override render() {
    const { req } = this.props
    const { originName } = this.props
    const requestClass = getSignatureRequestClass(req)

    return (
      <div key={req.id || req.handlerId} className={requestClass}>
        <TypedSignatureOverview {...{ originName, req }} />
      </div>
    )
  }
}

export default function TransactionRequestWithState(props: any) {
  const originName = useOriginName(props.req.origin)
  return <TransactionRequest {...props} originName={originName} />
}
