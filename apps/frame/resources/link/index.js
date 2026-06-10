import { v4 } from 'uuid'
import EventEmitter from 'events'

const source = 'tray:link'

const unwrap = (v) => (v !== undefined || v !== null ? JSON.parse(v) : v)
const wrap = (v) => (v !== undefined || v !== null ? JSON.stringify(v) : v)

const handlers = {}

const link = new EventEmitter()
link.rpc = (...args) => {
  const cb = args.pop()
  if (typeof cb !== 'function') throw new Error('link.rpc requires a callback')
  const id = v4()
  handlers[id] = cb
  window.postMessage(wrap({ id, args, source, method: 'rpc' }), '*')
}
link.send = (...args) => {
  window.postMessage(wrap({ args, source, method: 'event' }), '*')
}
link.invoke = (...args) => {
  return new Promise((resolve) => {
    const id = v4()
    handlers[id] = resolve
    window.postMessage(wrap({ id, args, source, method: 'invoke' }), '*')
  })
}

window.addEventListener(
  'message',
  (e) => {
    // only accept messages from this window; file:// pages have an opaque ("null")
    // origin in modern Chromium so origin strings can't be used for this check
    if (e.source !== window || e.data.source?.includes('react-devtools')) return
    const data = unwrap(e.data)
    const args = data.args || []
    if (data.source !== source) {
      if (data.method === 'rpc') {
        if (!handlers[data.id]) return console.log('link.rpc response had no handler')
        handlers[data.id](...args)
        delete handlers[data.id]
      } else if (data.method === 'invoke') {
        if (!handlers[data.id]) return console.log('link.invoke response had no handler')
        handlers[data.id](args)
        delete handlers[data.id]
      } else if (data.method === 'event') {
        if (!data.channel) return console.log('link.on event had no channel')
        link.emit(data.channel, ...args)
      }
    }
  },
  false
)

export default link
