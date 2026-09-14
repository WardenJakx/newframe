import { persistedImageSource } from '../../../../asset-data/domain/image'
import { SimpleTypedData } from '../../ui/SimpleTypedData'
import type { TypedDataRequestView } from './requestViewTypes'
import { useOriginName, useOrigins } from './state'

export default function SignTypedDataRequest({ req }: { req: TypedDataRequestView }) {
  const originName = useOriginName(req.origin)
  const origins = useOrigins()
  return (
    <SimpleTypedData
      key={req.id || req.handlerId}
      originName={originName}
      favicon={persistedImageSource(origins[req.origin]?.image)}
      req={req}
    />
  )
}
