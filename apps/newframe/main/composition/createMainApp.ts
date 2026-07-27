import {
  registerOperationHandlers,
  type IpcMainHandlerPort,
  type OperationDispatcher
} from '../ipc/operations'
import type { StateStream } from '../ipc/stateStream'

export interface MainApp {
  readonly started: boolean
  start(): void
  dispose(): void
}

export interface MainAppDependencies {
  ipc: IpcMainHandlerPort
  operationDispatcher: OperationDispatcher
  stateStream: StateStream
}

export function createMainApp({ ipc, operationDispatcher, stateStream }: MainAppDependencies): MainApp {
  let active = false
  let disposers: Array<() => void> = []

  return {
    get started() {
      return active
    },
    start() {
      if (active) return

      const started: Array<() => void> = []
      try {
        started.push(registerOperationHandlers(ipc, operationDispatcher))
        started.push(stateStream.registerHandlers(ipc))
        disposers = started
        active = true
      } catch (error) {
        started.reverse().forEach((dispose) => dispose())
        throw error
      }
    },
    dispose() {
      if (!active) return

      disposers.reverse().forEach((dispose) => dispose())
      disposers = []
      stateStream.dispose()
      active = false
    }
  }
}
