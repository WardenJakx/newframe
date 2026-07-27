export interface PersistenceStoragePort {
  clear(): void
  delete(key: string): unknown
  get(key: string): unknown
  set(key: string, value: unknown): unknown
}

const storageMethods = ['clear', 'delete', 'get', 'set'] as const

export function assertPersistenceStoragePort(value: unknown): asserts value is PersistenceStoragePort {
  if (
    typeof value !== 'object' ||
    value === null ||
    storageMethods.some((method) => typeof (value as Record<string, unknown>)[method] !== 'function')
  ) {
    throw new TypeError('Canonical persistence storage does not implement the required port.')
  }
}

export interface PersistenceClockPort {
  now(): number
}

export interface PersistenceSchedulerPort {
  scheduleEvery(intervalMs: number, task: () => void): () => void
}

export interface PersistenceLoggerPort {
  error(message: string, details?: unknown): void
}

export interface PersistenceLifecycle {
  readonly started: boolean
  start(): Promise<void>
  flush(): void
  dispose(): void
}
