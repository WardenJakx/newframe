import { persistedImageSource } from '../../../../asset-data/domain/image/index.ts'
import { SimpleTypedData } from '../../ui/SimpleTypedData.tsx'
import type { TypedDataRequestView } from './requestViewTypes.ts'
import { useOriginName, useOrigins } from './state.ts'

export default function SignTypedDataRequest({ req }: { req: TypedDataRequestView }) {
  const originName = useOriginName(req.origin)
  const origins = useOrigins()
  return (
    <SimpleTypedData
      key={req.id ?? req.requestId}
      originName={originName}
      favicon={persistedImageSource(origins[req.origin]?.image)}
      req={req}
    />
  )
}
