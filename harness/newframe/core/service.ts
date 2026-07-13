export interface HarnessService<T> {
  readonly name: string
  readonly failure?: Promise<never>
  start(): Promise<T>
  stop(): Promise<void>
}

type StartedService = HarnessService<unknown>

export class HarnessRuntime {
  private readonly services: StartedService[] = []
  private stopping = false
  private readonly log: (message: string) => void

  constructor(log: (message: string) => void) {
    this.log = log
  }

  async start<T>(service: HarnessService<T>) {
    this.log(`starting ${service.name}`)
    this.services.push(service as StartedService)

    try {
      const value = await service.start()
      service.failure?.catch(() => undefined)
      this.log(`started ${service.name}`)
      return value
    } catch (err) {
      await service.stop().catch(() => undefined)
      this.services.splice(this.services.indexOf(service as StartedService), 1)
      throw err
    }
  }

  async watch<T>(work: Promise<T>): Promise<T> {
    const failures = this.services.flatMap((service) => (service.failure ? [service.failure] : []))
    return failures.length > 0 ? Promise.race([work, ...failures]) : work
  }

  async stop() {
    if (this.stopping) return
    this.stopping = true

    for (const service of this.services.reverse()) {
      await service.stop().catch((err) => {
        this.log(`could not stop ${service.name}: ${err instanceof Error ? err.message : String(err)}`)
      })
      this.log(`stopped ${service.name}`)
    }
  }
}

export function installSignalHandlers(runtime: HarnessRuntime, beforeExit?: () => Promise<void>) {
  const handlers = new Map<NodeJS.Signals, () => void>()

  for (const [signal, code] of [
    ['SIGINT', 130],
    ['SIGTERM', 143]
  ] as const) {
    const handler = () => {
      void runtime
        .stop()
        .then(() => beforeExit?.())
        .finally(() => process.exit(code))
    }
    handlers.set(signal, handler)
    process.once(signal, handler)
  }

  return () => {
    handlers.forEach((handler, signal) => process.off(signal, handler))
  }
}
