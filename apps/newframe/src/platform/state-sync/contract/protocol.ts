import { z } from 'zod'

export const StateConnectChannel = 'newframe:state-connect'
export const StateDisconnectChannel = 'newframe:state-disconnect'
export const StateMessageChannel = 'newframe:state-message'

export type TrayState = Record<string, unknown>

export const StateConnectionResultSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true) }),
  z.strictObject({ ok: z.literal(false), error: z.enum(['unauthorized', 'state_unavailable']) })
])

export type StateMessage<TState extends TrayState = TrayState> =
  | { state: TState }
  | { changes: Partial<TState> }

export type StateConnectionResult = z.infer<typeof StateConnectionResultSchema>
