import {
  TRPCClientError,
  createTRPCClient,
  httpLink,
  createWSClient,
  wsLink,
  type TRPCClient
} from '@trpc/client'

import type { DesktopRouter } from './router.js'

export function createDesktopClient(
  baseUrl: string,
  options: Pick<Parameters<typeof httpLink<DesktopRouter>>[0], 'fetch' | 'headers'> = {}
) {
  return createTRPCClient<DesktopRouter>({
    links: [httpLink({ url: `${baseUrl.replace(/\/$/, '')}/trpc`, ...options })]
  })
}
export function createDesktopSocket(options: Parameters<typeof createWSClient>[0]): {
  client: TRPCClient<DesktopRouter>
  socket: ReturnType<typeof createWSClient>
} {
  const socket = createWSClient(options)
  const client = createTRPCClient<DesktopRouter>({ links: [wsLink({ client: socket })] })
  return { client, socket }
}
export function isDesktopClientError(error: unknown): error is TRPCClientError<DesktopRouter> {
  return error instanceof TRPCClientError
}
