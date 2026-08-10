import { SimpleTypedData as TypedSignatureOverview } from '../../ui/SimpleTypedData'
import { useOriginName } from './state'
import type { TypedDataRequestView } from './requestViewTypes'

type TransactionRequestProps = {
  req: TypedDataRequestView
  originName: string
}

type TransactionRequestWithStateProps = Omit<TransactionRequestProps, 'originName'>

function TransactionRequest(props: TransactionRequestProps) {
  const { req, originName } = props
  return <TypedSignatureOverview key={req.id || req.handlerId} {...{ originName, req }} />
}

export default function TransactionRequestWithState(props: TransactionRequestWithStateProps) {
  const originName = useOriginName(props.req.origin)
  return <TransactionRequest {...props} originName={originName} />
}
