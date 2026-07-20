import { SimpleTypedData as TypedSignatureOverview } from '../../../../resources/Components/SimpleTypedData'
import { useOriginName } from './state'
import type { SignTypedDataRequest } from '../../../../main/accounts/types'

type TransactionRequestProps = {
  req: SignTypedDataRequest & { id?: string }
  originName: string
}

type TransactionRequestWithStateProps = Omit<TransactionRequestProps, 'originName'>

export function TransactionRequest(props: TransactionRequestProps) {
  const { req, originName } = props
  return <TypedSignatureOverview key={req.id || req.handlerId} {...{ originName, req }} />
}

export default function TransactionRequestWithState(props: TransactionRequestWithStateProps) {
  const originName = useOriginName(props.req.origin)
  return <TransactionRequest {...props} originName={originName} />
}
