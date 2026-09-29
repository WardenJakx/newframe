import { initTRPC, TRPCError } from '@trpc/server'
import { z } from 'zod'

import {
  AgentConnectSchema,
  AgentCredentialsSchema,
  ChainSchema,
  HashSchema,
  HexSchema,
  OriginStatusSchema,
  ProviderEventSchema,
  RoutingSchema,
  RpcCallSchema,
  WalletEventSchema,
  type AgentConnect,
  type RpcCall,
  type RpcError,
  type ProviderEvent,
  type WalletEvent
} from './schemas.js'

/** Ports only: no desktop, Electron, or wallet implementation enters the client type graph. */
export interface DesktopContext {
  rpc(this: void, input: RpcCall): Promise<unknown>
  events?(events: ProviderEvent[], signal?: AbortSignal): AsyncIterable<WalletEvent>
  agent?: {
    connect(input: AgentConnect, signal?: AbortSignal): Promise<unknown>
    status(): void
    revoke(sessionId: string): void
  }
}
export class WalletRpcError extends Error {
  constructor(readonly rpc: RpcError) {
    super(rpc.message)
  }
}
const t = initTRPC.context<DesktopContext>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: { ...shape.data, rpc: error.cause instanceof WalletRpcError ? error.cause.rpc : undefined }
    }
  }
})
// Gateway results are unknown until the output validator parses them.
const output = <S extends z.ZodType>(schema: S) => z.preprocess((value) => value, schema)
const p = t.procedure
const agent = p.use(({ ctx, next }) => {
  if (!ctx.agent) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Agent API does not accept browser-originated requests'
    })
  }
  return next({ ctx: { ...ctx, agent: ctx.agent } })
})
export const desktopRouter = t.router({
  rpc: p.input(RpcCallSchema).mutation(({ ctx, input }) => ctx.rpc(input)),
  wallet: t.router({
    getEthereumChains: p
      .input(RoutingSchema)
      .output(output(z.array(ChainSchema)))
      .query(({ ctx, input }) => ctx.rpc({ ...input, method: 'wallet_getEthereumChains', params: [] })),
    chainId: p
      .input(RoutingSchema)
      .output(output(z.string()))
      .query(({ ctx, input }) => ctx.rpc({ ...input, method: 'eth_chainId', params: [] })),
    clientVersion: p
      .input(RoutingSchema)
      .output(output(z.string()))
      .query(({ ctx, input }) => ctx.rpc({ ...input, method: 'web3_clientVersion', params: [] })),
    sendTransaction: p
      .input(RoutingSchema.extend({ transaction: z.record(z.string(), z.unknown()) }))
      .output(output(HashSchema))
      .mutation(({ ctx, input: { transaction, ...route } }) =>
        ctx.rpc({ ...route, method: 'eth_sendTransaction', params: [transaction] })
      ),
    signTypedData: p
      .input(RoutingSchema.extend({ account: z.string(), data: z.string() }))
      .output(output(HexSchema))
      .mutation(({ ctx, input: { account, data, ...route } }) =>
        ctx.rpc({ ...route, method: 'eth_signTypedData_v4', params: [account, data] })
      ),
    personalSign: p
      .input(RoutingSchema.extend({ account: z.string(), message: z.string() }))
      .output(output(z.string()))
      .mutation(({ ctx, input: { account, message, ...route } }) =>
        ctx.rpc({ ...route, method: 'personal_sign', params: [message, account] })
      ),
    events: p.input(z.object({ events: z.array(ProviderEventSchema) })).subscription(async function* ({
      ctx,
      input,
      signal
    }) {
      if (!ctx.events) {
        throw new TRPCError({ code: 'METHOD_NOT_SUPPORTED' })
      }
      for await (const event of ctx.events(input.events, signal)) {
        yield WalletEventSchema.parse(event)
      }
    })
  }),
  origins: t.router({
    getStatus: p
      .input(RoutingSchema)
      .output(output(OriginStatusSchema))
      .query(({ ctx, input }) => ctx.rpc({ ...input, method: 'frame_getOriginStatus', params: [] })),
    disconnect: p
      .input(RoutingSchema)
      .output(output(OriginStatusSchema))
      .mutation(({ ctx, input }) => ctx.rpc({ ...input, method: 'frame_disconnectOrigin', params: [] }))
  }),
  extension: t.router({
    connect: p
      .input(RoutingSchema)
      .output(output(z.string()))
      .mutation(({ ctx, input }) =>
        ctx.rpc({ ...input, method: 'frame_requestExtensionConnection', params: [] })
      ),
    summon: p
      .input(RoutingSchema)
      .output(output(z.null()))
      .mutation(async ({ ctx, input }) => {
        await ctx.rpc({ ...input, method: 'frame_summon', params: [] })
        return null
      })
  }),
  agent: t.router({
    connect: agent
      .input(AgentConnectSchema)
      .output(output(AgentCredentialsSchema))
      .mutation(({ ctx, input, signal }) => ctx.agent.connect(input, signal)),
    status: agent.query(({ ctx }) => {
      ctx.agent.status()
      return { active: true as const }
    }),
    revoke: agent.input(z.object({ sessionId: z.string() })).mutation(({ ctx, input }) => {
      ctx.agent.revoke(input.sessionId)
      return { revoked: true as const }
    })
  })
})
export type DesktopRouter = typeof desktopRouter
export const createDesktopCaller = t.createCallerFactory(desktopRouter)
