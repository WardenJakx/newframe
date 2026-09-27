import { createRendererGateway } from '../../../app/main/gateway/renderer.js'
import { createNewframeInternalSource } from '../../../app/main/gateway/requestSource.js'
import type { OperationServices } from '../../../app/main/ipc-handlers/renderer.js'
import { ExecuteCommandChannel, ExecuteQueryChannel } from '../contract/ipc.js'
export interface OperationDispatcher {
  dispatchCommand(event: Electron.IpcMainInvokeEvent, command: unknown): Promise<unknown>
  dispatchQuery(event: Electron.IpcMainInvokeEvent, query: unknown): Promise<unknown>
}

export interface IpcMainHandlerPort {
  handle(
    channel: string,
    listener: (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown> | unknown
  ): void
  removeHandler(channel: string): void
}

/** Entry point authorization: only registered, live renderer frames reach the Gateway. */
export function createOperationDispatcher(services: OperationServices): OperationDispatcher {
  const gateway = createRendererGateway(services)
  const dispatch = (kind: 'command' | 'query', event: Electron.IpcMainInvokeEvent, input: unknown) => {
    const context = services.authorizeRenderer(event)
    return gateway.dispatch(
      kind,
      input,
      context ? { event, context: { ...context, source: createNewframeInternalSource(context) } } : undefined
    )
  }
  return {
    dispatchCommand: (event, input) => dispatch('command', event, input),
    dispatchQuery: (event, input) => dispatch('query', event, input)
  }
}

export function registerOperationHandlers(ipc: IpcMainHandlerPort, dispatcher: OperationDispatcher) {
  ipc.handle(ExecuteCommandChannel, (event, command) => dispatcher.dispatchCommand(event, command))
  ipc.handle(ExecuteQueryChannel, (event, query) => dispatcher.dispatchQuery(event, query))
  return () => {
    ipc.removeHandler(ExecuteCommandChannel)
    ipc.removeHandler(ExecuteQueryChannel)
  }
}
