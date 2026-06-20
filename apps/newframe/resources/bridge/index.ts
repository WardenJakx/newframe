import { ipcRenderer } from 'electron'
import rpc from './rpc'

const unwrap = (v: any) => (v !== undefined && v !== null ? JSON.parse(v) : v)
const wrap = (v: any) => (v !== undefined && v !== null ? JSON.stringify(v) : v)
const source = 'bridge:link'

window.addEventListener(
  'message',
  (e: MessageEvent) => {
    // only accept messages from this window; file:// pages have an opaque ("null")
    // origin in modern Chromium so origin strings can't be used for this check
    if (e.source !== window || e.data.source?.includes('react-devtools')) return
    const data = unwrap(e.data)
    if (data.source !== source) {
      if (data.method === 'rpc') {
        return rpc(...data.args, (...args: any[]) =>
          (e.source as Window).postMessage(wrap({ method: 'rpc', id: data.id, args, source }), '*')
        )
      }
      if (data.method === 'event') return ipcRenderer.send(...(data.args as [string, ...any[]]))
      if (data.method === 'invoke') {
        ;(async () => {
          const args = await ipcRenderer.invoke(...(data.args as [string, ...any[]]))
          window.postMessage(wrap({ method: 'invoke', channel: 'action', id: data.id, args, source }), '*')
        })()
      }
    }
  },
  false
)

ipcRenderer.on('main:action', (...args: any[]) => {
  args.shift()
  window.postMessage(wrap({ method: 'event', channel: 'action', args, source }), '*')
})

ipcRenderer.on('main:flex', (...args: any[]) => {
  args.shift()
  window.postMessage(wrap({ method: 'event', channel: 'flex', args, source }), '*')
})

ipcRenderer.on('main:dapp', (...args: any[]) => {
  args.shift()
  window.postMessage(wrap({ method: 'event', channel: 'dapp', args, source }), '*')
})
