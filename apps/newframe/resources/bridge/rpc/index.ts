import { ipcRenderer } from 'electron'

let i = 0
const newId = () => ++i

const defined = (value: any) => value !== undefined && value !== null
const unwrap = (value: any) => (defined(value) ? JSON.parse(value) : value)
const wrap = (value: any) => (defined(value) ? JSON.stringify(value) : value)

const pending = new Map<any, { resolve: (args: any[]) => void; reject: (err: unknown) => void }>()

const responseId = (id: any) => {
  if (typeof id !== 'string') return id

  try {
    return JSON.parse(id)
  } catch {
    return id
  }
}

ipcRenderer.on('main:rpc', (_sender, id, ...args) => {
  id = responseId(id)
  const request = pending.get(id)
  if (!request) return console.log('Message from main RPC had no handler:', args)

  pending.delete(id)

  try {
    request.resolve(args.map(unwrap))
  } catch (err) {
    request.reject(err)
  }
})

export default (method: string, args: any[] = []) => {
  const id = newId()

  return new Promise<any[]>((resolve, reject) => {
    pending.set(id, { resolve, reject })

    try {
      ipcRenderer.send('main:rpc', JSON.stringify(id), wrap(method), ...args.map(wrap))
    } catch (err) {
      pending.delete(id)
      reject(err)
    }
  })
}
