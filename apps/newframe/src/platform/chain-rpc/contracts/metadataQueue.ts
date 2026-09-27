const MAX_ACTIVE = 2
const MAX_WAITING = 128
const MIN_START_INTERVAL_MS = 100

interface Queue {
  active: number
  lastStarted?: number
  waiting: Array<() => void>
  pending: Map<string, Promise<unknown>>
  timer?: ReturnType<typeof setTimeout>
}

const queues = new WeakMap<object, Queue>()
const rpcQueues = new WeakMap<object, Queue>()
let nextRpcId = 0

function drain(queue: Queue) {
  if (queue.active >= MAX_ACTIVE || !queue.waiting.length || queue.timer) {
    return
  }
  const delay =
    queue.lastStarted === undefined
      ? 0
      : Math.max(0, MIN_START_INTERVAL_MS - (Date.now() - queue.lastStarted))
  if (delay) {
    queue.timer = setTimeout(() => {
      queue.timer = undefined
      drain(queue)
    }, delay)
    return
  }
  const start = queue.waiting.shift()
  start?.()
  drain(queue)
}

function enqueue<T>(
  queuesByProvider: WeakMap<object, Queue>,
  provider: object,
  key: string,
  work: () => Promise<T>
): Promise<T> {
  let queue = queuesByProvider.get(provider)
  if (!queue) {
    queue = { active: 0, waiting: [], pending: new Map() }
    queuesByProvider.set(provider, queue)
  }
  const existing = queue.pending.get(key)
  if (existing) {
    return existing as Promise<T>
  }
  if (queue.waiting.length >= MAX_WAITING) {
    return Promise.reject(new Error('Token metadata queue is full'))
  }

  const owner = queue
  const result = new Promise<T>((resolve, reject) => {
    owner.waiting.push(() => {
      owner.active += 1
      owner.lastStarted = Date.now()
      void Promise.resolve()
        .then(work)
        .then(resolve, reject)
        .finally(() => {
          owner.active -= 1
          owner.pending.delete(key)
          drain(owner)
        })
    })
  })
  owner.pending.set(key, result)
  drain(owner)
  return result
}

export function queueTokenMetadata<T>(provider: object, key: string, work: () => Promise<T>): Promise<T> {
  return enqueue(queues, provider, key, work)
}

export function queueTokenMetadataRpc<T>(provider: object, work: () => Promise<T>): Promise<T> {
  return enqueue(rpcQueues, provider, String(nextRpcId++), work)
}
