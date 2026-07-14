import { contextBridge, ipcRenderer } from 'electron'
import { ExecuteCommandChannel, ExecuteQueryChannel, type NewframeHost } from './contracts'
import {
  StateConnectChannel,
  StateConnectionResultSchema,
  StateDisconnectChannel,
  StateMessageChannel,
  type StateMessage
} from '../state/protocol'

let stateHandler: ((message: StateMessage) => void) | undefined

ipcRenderer.on(StateMessageChannel, (_event, message: unknown) => {
  if (stateHandler) stateHandler(message as StateMessage)
})

const host: NewframeHost = {
  executeCommand(command) {
    return ipcRenderer.invoke(ExecuteCommandChannel, command)
  },
  executeQuery(query) {
    return ipcRenderer.invoke(ExecuteQueryChannel, query)
  },
  async connectState(handler) {
    stateHandler = handler
    const result = await ipcRenderer.invoke(StateConnectChannel)
    return StateConnectionResultSchema.parse(result)
  },
  async disconnectState() {
    stateHandler = undefined
    const result = await ipcRenderer.invoke(StateDisconnectChannel)
    return StateConnectionResultSchema.parse(result)
  }
}

contextBridge.exposeInMainWorld('__NEWFRAME_HOST__', host)
