import log from 'electron-log'
import { z } from 'zod'

import { commandContracts, queryContracts } from '../../contracts/operations.ts'
import {
  createOperationRegistry,
  type OperationServices,
  type OperationRegistry,
  type RendererOperationContext
} from '../ipc-handlers/renderer.ts'
import { dispatchGatewayOperation } from './dispatch.ts'

const OperationTypeSchema = z.looseObject({ type: z.string().max(128) })
type RendererRequest = { event: Electron.IpcMainInvokeEvent; context: RendererOperationContext }

export function createRendererGateway(services: OperationServices) {
  const { commandRegistry, queryRegistry } = createOperationRegistry(services)
  return {
    async dispatch(kind: 'command' | 'query', input: unknown, request: RendererRequest | undefined) {
      if (!request) {
        return { ok: false, error: 'unauthorized' }
      }
      const parsed = OperationTypeSchema.safeParse(input)
      const type = parsed.success ? parsed.data.type : ''
      const registry: OperationRegistry = kind === 'command' ? commandRegistry : queryRegistry
      const contracts: Record<string, { input: z.ZodType; result: z.ZodType }> =
        kind === 'command' ? commandContracts : queryContracts
      const operation = Object.hasOwn(registry, type) ? registry[type] : undefined
      const contract = Object.hasOwn(contracts, type) ? contracts[type] : undefined
      if (!operation || !contract) {
        return { ok: false, error: `invalid_${kind}` }
      }
      const result = await dispatchGatewayOperation(
        {
          parse: (value) => contract.input.safeParse(value),
          authorize: (_value, { context }: RendererRequest) =>
            operation.roles.includes(context.clientType) &&
            (!operation.entrypoints || operation.entrypoints.includes(context.entrypoint)),
          handle: (value, { event, context }) => operation.handle(value, event, context),
          validateResult: (value) => contract.result.safeParse(value).success
        },
        input,
        request,
        (error) => log.error('Gateway operation failed', { type, error })
      )
      if (result.ok) {
        return contract.result.parse(result.value)
      }
      if (result.error === 'operation_failed') {
        return operation.failure
      }
      return { ok: false, error: result.error === 'invalid_request' ? `invalid_${kind}` : result.error }
    }
  }
}
