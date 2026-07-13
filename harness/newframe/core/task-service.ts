import type { HarnessService } from './service.ts'

export type TaskHandle<T> = {
  completed: Promise<T>
}

export class TaskService<T> implements HarnessService<TaskHandle<T>> {
  readonly name: string
  failure?: Promise<never>

  private readonly run: (signal: AbortSignal) => Promise<T>
  private controller?: AbortController
  private handle?: TaskHandle<T>
  private stopping = false

  constructor(name: string, run: (signal: AbortSignal) => Promise<T>) {
    this.name = name
    this.run = run
  }

  async start() {
    if (this.handle) return this.handle

    this.controller = new AbortController()
    const completed = Promise.resolve().then(() => this.run(this.controller!.signal))
    completed.catch(() => undefined)

    this.failure = new Promise<never>((_, reject) => {
      completed.catch((error) => {
        if (!this.stopping) reject(error)
      })
    })
    this.failure.catch(() => undefined)
    this.handle = { completed }

    return this.handle
  }

  async stop() {
    this.stopping = true
    this.controller?.abort()
    await this.handle?.completed.catch(() => undefined)
  }
}
