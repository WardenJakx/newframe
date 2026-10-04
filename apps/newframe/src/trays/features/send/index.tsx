import type { SendCapability } from './sendService.ts'
import { SendView } from './SendView.tsx'
import { useSendController } from './useSendController.ts'

export interface SendProps {
  assetId?: string | null
  capability: SendCapability
}

export default function Send({ assetId, capability }: SendProps) {
  return <SendView capability={capability} {...useSendController({ assetId, capability })} />
}
