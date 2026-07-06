import EventEmitter from 'events'

import type { LinkInvokeChannel, LinkRpcMethod, LinkSendChannel } from '../bridge/contracts'

const getHost = () => {
  if (typeof window === 'undefined' || !window.__NEWFRAME_HOST__) {
    throw new Error('Newframe host bridge is unavailable')
  }

  return window.__NEWFRAME_HOST__
}

type Link = EventEmitter & {
  send(channel: LinkSendChannel, ...args: any[]): void
  send(channel: string, ...args: any[]): void
  invoke(channel: LinkInvokeChannel, ...args: any[]): Promise<any>
  invoke(channel: string, ...args: any[]): Promise<any>
  rpc(method: LinkRpcMethod, ...args: any[]): void
  rpc(method: string, ...args: any[]): void
}

const link = new EventEmitter() as Link
const on = link.on.bind(link)

let listeningForActions = false

const listenForActions = () => {
  if (listeningForActions) return

  getHost().onAction((...args) => {
    link.emit('action', ...args)
  })

  listeningForActions = true
}

link.send = (channel: string, ...args: any[]) => {
  getHost().send(channel as LinkSendChannel, args)
}

link.invoke = (channel: string, ...args: any[]) => {
  return getHost().invoke(channel as LinkInvokeChannel, args)
}

link.rpc = (method: string, ...args: any[]) => {
  const callback = args.pop()

  if (typeof callback !== 'function') throw new Error('link.rpc requires a callback')

  void getHost()
    .rpc(method as LinkRpcMethod, args)
    .then((responseArgs) => {
      callback(...responseArgs)
    })
    .catch((error) => {
      callback(error)
    })
}

link.on = ((eventName: string | symbol, listener: (...args: any[]) => void) => {
  if (eventName === 'action') listenForActions()

  return on(eventName, listener)
}) as Link['on']

export default link
