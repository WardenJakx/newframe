import React from 'react'
import Restore from 'react-restore'

import { SimpleTypedData as TypedSignatureOverview } from '../../../../../resources/Components/SimpleTypedData'
import { getSignatureRequestClass } from '../../../../../resources/domain/request'

class TransactionRequest extends React.Component<any, any> {
  declare store: Store

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
    const originName = this.store('main.origins', req.origin, 'name')
    const requestClass = getSignatureRequestClass(req)

    return (
      <div key={req.id || req.handlerId} className={requestClass}>
        <TypedSignatureOverview {...{ originName, req }} />
      </div>
    )
  }
}

export default Restore.connect(TransactionRequest)
