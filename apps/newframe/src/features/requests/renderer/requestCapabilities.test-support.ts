import { mock } from 'bun:test'

import type { CommandResult, QueryResultMap } from '../../../app/contracts/operations.ts'
import type { RequestTrayCapabilities } from './requestCapabilities.ts'

const acknowledged = <TInput>() => mock(async (_input: TInput): Promise<CommandResult> => ({ ok: true }))

export function createRequestTrayCapabilitiesFake() {
  return {
    safe: {
      refresh: acknowledged<Parameters<RequestTrayCapabilities['safe']['refresh']>[0]>(),
      confirm: acknowledged<Parameters<RequestTrayCapabilities['safe']['confirm']>[0]>(),
      execute: acknowledged<Parameters<RequestTrayCapabilities['safe']['execute']>[0]>(),
      prepareExecution: mock(
        async (
          _input: Parameters<RequestTrayCapabilities['safe']['prepareExecution']>[0]
        ): Promise<QueryResultMap['safe.execution-prepare']> => ({
          ok: false,
          error: 'Execution unavailable'
        })
      ),
      confirmationStatus: mock(
        async (
          _input: Parameters<RequestTrayCapabilities['safe']['confirmationStatus']>[0]
        ): Promise<QueryResultMap['safe.confirmation-status']> => ({ status: 'idle' })
      ),
      simulate: mock(
        async (
          _input: Parameters<RequestTrayCapabilities['safe']['simulate']>[0]
        ): Promise<QueryResultMap['safe.simulate']> => ({
          status: 'unavailable',
          error: 'Simulation unavailable'
        })
      )
    },
    panel: {
      back: acknowledged<Parameters<RequestTrayCapabilities['panel']['back']>[0]>(),
      openRequest: acknowledged<Parameters<RequestTrayCapabilities['panel']['openRequest']>[0]>()
    },
    review: {
      resolveAccess: acknowledged<Parameters<RequestTrayCapabilities['review']['resolveAccess']>[0]>(),
      resolveAiSession: acknowledged<Parameters<RequestTrayCapabilities['review']['resolveAiSession']>[0]>(),
      resolveAddChain: acknowledged<Parameters<RequestTrayCapabilities['review']['resolveAddChain']>[0]>(),
      reviewAddChain: acknowledged<Parameters<RequestTrayCapabilities['review']['reviewAddChain']>[0]>(),
      reviewAddToken: acknowledged<Parameters<RequestTrayCapabilities['review']['reviewAddToken']>[0]>(),
      clearOrigin: acknowledged<Parameters<RequestTrayCapabilities['review']['clearOrigin']>[0]>(),
      confirmWarning: acknowledged<Parameters<RequestTrayCapabilities['review']['confirmWarning']>[0]>(),
      reject: acknowledged<Parameters<RequestTrayCapabilities['review']['reject']>[0]>(),
      resolveSwitchChain:
        acknowledged<Parameters<RequestTrayCapabilities['review']['resolveSwitchChain']>[0]>(),
      approve: acknowledged<Parameters<RequestTrayCapabilities['review']['approve']>[0]>(),
      confirmApproval: acknowledged<Parameters<RequestTrayCapabilities['review']['confirmApproval']>[0]>(),
      updateTokenApproval:
        acknowledged<Parameters<RequestTrayCapabilities['review']['updateTokenApproval']>[0]>()
    },
    transaction: {
      setFeePreference:
        acknowledged<Parameters<RequestTrayCapabilities['transaction']['setFeePreference']>[0]>(),
      replace: acknowledged<Parameters<RequestTrayCapabilities['transaction']['replace']>[0]>()
    },
    external: {
      copy: acknowledged<Parameters<RequestTrayCapabilities['external']['copy']>[0]>(),
      openExplorer: acknowledged<Parameters<RequestTrayCapabilities['external']['openExplorer']>[0]>(),
      writeText: mock(async (_text: string) => ({ ok: true })),
      hydrateTokenImage: mock(async (_tokenId: string) => ({ ok: true }))
    }
  } satisfies RequestTrayCapabilities
}

export type RequestTrayCapabilitiesFake = ReturnType<typeof createRequestTrayCapabilitiesFake>
