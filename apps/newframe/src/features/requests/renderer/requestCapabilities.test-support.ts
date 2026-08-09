import { mock } from 'bun:test'

import type { CommandResult } from '../../../app/contracts/operations'
import type { RequestRendererCapabilities } from './requestCapabilities'

const acknowledged = <TInput>() => mock(async (_input: TInput): Promise<CommandResult> => ({ ok: true }))

export function createRequestRendererCapabilitiesFake() {
  return {
    panel: {
      back: acknowledged<Parameters<RequestRendererCapabilities['panel']['back']>[0]>(),
      openRequest: acknowledged<Parameters<RequestRendererCapabilities['panel']['openRequest']>[0]>()
    },
    review: {
      resolveAccess: acknowledged<Parameters<RequestRendererCapabilities['review']['resolveAccess']>[0]>(),
      resolveAgentAccess:
        acknowledged<Parameters<RequestRendererCapabilities['review']['resolveAgentAccess']>[0]>(),
      reviewAddChain: acknowledged<Parameters<RequestRendererCapabilities['review']['reviewAddChain']>[0]>(),
      reviewAddToken: acknowledged<Parameters<RequestRendererCapabilities['review']['reviewAddToken']>[0]>(),
      clearOrigin: acknowledged<Parameters<RequestRendererCapabilities['review']['clearOrigin']>[0]>(),
      confirmWarning: acknowledged<Parameters<RequestRendererCapabilities['review']['confirmWarning']>[0]>(),
      reject: acknowledged<Parameters<RequestRendererCapabilities['review']['reject']>[0]>(),
      resolveSwitchChain:
        acknowledged<Parameters<RequestRendererCapabilities['review']['resolveSwitchChain']>[0]>(),
      approve: acknowledged<Parameters<RequestRendererCapabilities['review']['approve']>[0]>(),
      confirmApproval:
        acknowledged<Parameters<RequestRendererCapabilities['review']['confirmApproval']>[0]>(),
      updateTokenApproval:
        acknowledged<Parameters<RequestRendererCapabilities['review']['updateTokenApproval']>[0]>()
    },
    transaction: {
      updateFee: acknowledged<Parameters<RequestRendererCapabilities['transaction']['updateFee']>[0]>(),
      setDefaultFee:
        acknowledged<Parameters<RequestRendererCapabilities['transaction']['setDefaultFee']>[0]>(),
      replace: acknowledged<Parameters<RequestRendererCapabilities['transaction']['replace']>[0]>(),
      dismissFeeNotice:
        acknowledged<Parameters<RequestRendererCapabilities['transaction']['dismissFeeNotice']>[0]>()
    },
    external: {
      copy: acknowledged<Parameters<RequestRendererCapabilities['external']['copy']>[0]>(),
      openExplorer: acknowledged<Parameters<RequestRendererCapabilities['external']['openExplorer']>[0]>(),
      writeText: mock(async (_text: string) => ({ ok: true }) as CommandResult),
      hydrateTokenImage: mock(async (_tokenId: string) => ({ ok: true }) as CommandResult)
    }
  } satisfies RequestRendererCapabilities
}

export type RequestRendererCapabilitiesFake = ReturnType<typeof createRequestRendererCapabilitiesFake>
