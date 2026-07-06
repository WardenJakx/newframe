import { contextBridge, ipcRenderer } from 'electron'
import {
  LinkInvokeChannels,
  LinkRpcMethods,
  LinkSendChannels,
  type NewframeHost
} from './contracts'
import rpc from './rpc'

const sendChannels = new Set<string>(LinkSendChannels)
const invokeChannels = new Set<string>(LinkInvokeChannels)
const rpcMethods = new Set<string>(LinkRpcMethods)

const isKnownSend = (channel: unknown) => typeof channel === 'string' && sendChannels.has(channel)
const isKnownInvoke = (channel: unknown) => typeof channel === 'string' && invokeChannels.has(channel)
const isKnownRpc = (method: unknown) => typeof method === 'string' && rpcMethods.has(method)

const unknown = (type: string, name: unknown) => new Error(`Unknown ${type}: ${String(name)}`)

const host: NewframeHost = {
  send(channel, args = []) {
    if (!isKnownSend(channel)) return console.warn(unknown('send channel', channel).message)

    ipcRenderer.send(channel, ...args)
  },
  invoke(channel, args = []) {
    if (!isKnownInvoke(channel)) return Promise.reject(unknown('invoke channel', channel))

    return ipcRenderer.invoke(channel, ...args)
  },
  rpc(method, args = []) {
    if (!isKnownRpc(method)) return Promise.reject(unknown('RPC method', method))

    return rpc(method, args)
  },
  onAction(handler) {
    const wrapped = (_event: unknown, ...args: unknown[]) => handler(...args)

    ipcRenderer.on('main:action', wrapped)

    return () => ipcRenderer.removeListener('main:action', wrapped)
  }
}

contextBridge.exposeInMainWorld('__NEWFRAME_HOST__', host)
