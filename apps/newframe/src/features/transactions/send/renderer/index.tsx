import { SendView } from './SendView'
import type { SendCapability } from './sendService'
import { useSendController } from './useSendController'

export interface SendProps {
  assetId?: string | null
  capability: SendCapability
}

export default function Send({ assetId, capability }: SendProps) {
  return <SendView capability={capability} {...useSendController({ assetId, capability })} />
}
