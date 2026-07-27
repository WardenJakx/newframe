import type { PersistenceAdapter } from './createPersistenceAdapter.js'
import type { PersistenceLifecycle, PersistenceSchedulerPort } from './ports.js'

export interface PersistenceServiceDependencies {
  adapter: PersistenceAdapter
  hydrate(): Promise<void>
  scheduler: PersistenceSchedulerPort
  flushIntervalMs?: number
  onScheduledFlushError?(error: unknown): void
}

export function createPersistenceService({
  adapter,
  hydrate,
  scheduler,
  flushIntervalMs = 30_000,
  onScheduledFlushError = (error) => {
    throw error
  }
}: PersistenceServiceDependencies): PersistenceLifecycle {
  let active = false
  let disposed = false
  let startPromise: Promise<void> | undefined
  let cancelScheduledFlush: (() => void) | undefined

  return {
    get started() {
      return active
    },

    start() {
      if (startPromise) return startPromise
      if (disposed) return Promise.reject(new Error('Persistence service has been disposed.'))

      active = true
      startPromise = hydrate()
        .then(() => {
          if (disposed) return
          cancelScheduledFlush = scheduler.scheduleEvery(flushIntervalMs, () => {
            try {
              adapter.flush()
            } catch (error) {
              onScheduledFlushError(error)
            }
          })
        })
        .catch((error) => {
          active = false
          throw error
        })

      return startPromise
    },

    flush() {
      adapter.flush()
    },

    dispose() {
      if (disposed) return

      disposed = true
      active = false
      cancelScheduledFlush?.()
      cancelScheduledFlush = undefined
      adapter.flush()
    }
  }
}
