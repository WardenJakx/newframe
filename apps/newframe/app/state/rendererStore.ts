export interface RendererState {
  [key: string]: any
}

export interface RestoreStateUpdate {
  path: string
  value: unknown
}

export type RestoreActionBatch = Array<{
  updates?: RestoreStateUpdate[]
}>

type Listener = () => void

let currentState: RendererState = {}
const listeners = new Set<Listener>()

const normalizePath = (path: string) => {
  return path.replace(/]\[|]|\[|]/g, '.').replace(/"|'|^\.+|\.+$/g, '')
}

const splitPath = (path: string) => {
  if (!path || path === '*') return []

  return normalizePath(path).split('.').filter(Boolean)
}

const isObjectLike = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null
}

const setPathValue = (state: unknown, path: string[], value: unknown): unknown => {
  if (path.length === 0) return value

  const [key, ...rest] = path
  const next = Array.isArray(state) ? state.slice() : isObjectLike(state) ? { ...state } : {}
  const currentChild = isObjectLike(state) || Array.isArray(state) ? (state as any)[key] : undefined

  ;(next as any)[key] = setPathValue(currentChild, rest, value)

  return next
}

const applyUpdate = (state: RendererState, update: RestoreStateUpdate): RendererState => {
  if (update.path === '*') return update.value as RendererState

  return setPathValue(state, splitPath(update.path), update.value) as RendererState
}

const notify = () => {
  listeners.forEach((listener) => listener())
}

export function initializeRendererStateStore(initialState: RendererState = {}) {
  currentState = initialState || {}
  notify()
}

export function applyRestoreActionBatch(actionBatch: RestoreActionBatch) {
  if (!Array.isArray(actionBatch)) return

  let nextState = currentState
  let hasUpdates = false

  actionBatch.forEach((action) => {
    ;(action.updates || []).forEach((update) => {
      if (!update || typeof update.path !== 'string') return

      nextState = applyUpdate(nextState, update)
      hasUpdates = true
    })
  })

  if (!hasUpdates) return

  currentState = nextState
  notify()
}

export function getRendererStateSnapshot() {
  return currentState
}

export function subscribeToRendererState(listener: Listener) {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}
