import { z } from 'zod'

export const STATE_STREAM_SCHEMA_VERSION = 1 as const
export const StateConnectChannel = 'newframe:state-connect'
export const StateDisconnectChannel = 'newframe:state-disconnect'
export const StateMessageChannel = 'newframe:state-message'

export type RendererState = Record<string, unknown>

export const RendererStateSchema = z.record(z.string(), z.unknown())

export const StateSnapshotSchema = z.strictObject({
  schemaVersion: z.literal(STATE_STREAM_SCHEMA_VERSION),
  streamId: z.string().min(1),
  revision: z.number().int().nonnegative(),
  state: RendererStateSchema
})

export const StateUpdateBatchSchema = z
  .strictObject({
    schemaVersion: z.literal(STATE_STREAM_SCHEMA_VERSION),
    streamId: z.string().min(1),
    baseRevision: z.number().int().nonnegative(),
    revision: z.number().int().nonnegative(),
    changes: RendererStateSchema.refine((changes) => Object.keys(changes).length > 0)
  })
  .refine((batch) => batch.revision === batch.baseRevision + 1)

export const StateStreamInvalidatedSchema = z.strictObject({
  schemaVersion: z.literal(STATE_STREAM_SCHEMA_VERSION),
  streamId: z.string().min(1),
  type: z.literal('stream-invalidated')
})

export const StateMessageSchema = z.union([
  StateSnapshotSchema,
  StateUpdateBatchSchema,
  StateStreamInvalidatedSchema
])

export const StateConnectionResultSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true) }),
  z.strictObject({ ok: z.literal(false), error: z.enum(['unauthorized', 'state_unavailable']) })
])

type ParsedStateSnapshot = z.infer<typeof StateSnapshotSchema>
type ParsedStateUpdateBatch = z.infer<typeof StateUpdateBatchSchema>
export type StateStreamInvalidated = z.infer<typeof StateStreamInvalidatedSchema>

export type StateSnapshot<TState extends RendererState = RendererState> = Omit<
  ParsedStateSnapshot,
  'state'
> & {
  state: TState
}

export type StateUpdateBatch<TState extends RendererState = RendererState> = Omit<
  ParsedStateUpdateBatch,
  'changes'
> & {
  changes: Partial<TState>
}

export type StateMessage<TState extends RendererState = RendererState> =
  | StateSnapshot<TState>
  | StateUpdateBatch<TState>
  | StateStreamInvalidated

export type StateConnectionResult = z.infer<typeof StateConnectionResultSchema>
