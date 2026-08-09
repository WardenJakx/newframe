type Fetch = typeof fetch

export interface ProviderRequestPolicyOptions {
  minIntervalMs?: number
  maxRetries?: number
  retryBaseDelayMs?: number
  maxRetryDelayMs?: number
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

const retryableStatuses = new Set([429, 500, 502, 503, 504])

function defaultSleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

function parseRetryAfter(value: string | null) {
  if (!value) return undefined

  const seconds = Number(value)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)

  const date = Date.parse(value)
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now())

  return undefined
}

export default class ProviderRequestPolicy {
  private requestQueue = Promise.resolve()
  private lastAttemptAt?: number

  private readonly fetch: Fetch
  private readonly minIntervalMs: number
  private readonly maxRetries: number
  private readonly retryBaseDelayMs: number
  private readonly maxRetryDelayMs: number
  private readonly now: () => number
  private readonly sleep: (ms: number) => Promise<void>

  constructor(fetchImpl: Fetch, options: ProviderRequestPolicyOptions = {}) {
    this.fetch = fetchImpl
    this.minIntervalMs = options.minIntervalMs ?? 1000
    this.maxRetries = options.maxRetries ?? 3
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? 2000
    this.maxRetryDelayMs = options.maxRetryDelayMs ?? 30_000
    this.now = options.now ?? Date.now
    this.sleep = options.sleep ?? defaultSleep
  }

  async request(url: string, init?: RequestInit) {
    const previousRequest = this.requestQueue
    let releaseRequest: () => void = () => {}

    this.requestQueue = new Promise<void>((resolve) => {
      releaseRequest = resolve
    })

    await previousRequest

    try {
      return await this.requestWithRetries(url, init)
    } finally {
      releaseRequest()
    }
  }

  private async requestWithRetries(url: string, init?: RequestInit) {
    let lastError: unknown

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      await this.waitForAttemptSlot()

      try {
        const response = await this.fetch(url, init)

        if (!retryableStatuses.has(response.status) || attempt === this.maxRetries) {
          return response
        }

        await this.sleep(this.retryDelay(response, attempt))
      } catch (e) {
        lastError = e
        if (attempt === this.maxRetries) throw e

        await this.sleep(this.retryDelay(undefined, attempt))
      }
    }

    throw lastError
  }

  private async waitForAttemptSlot() {
    if (this.lastAttemptAt !== undefined) {
      const waitMs = this.lastAttemptAt + this.minIntervalMs - this.now()
      if (waitMs > 0) await this.sleep(waitMs)
    }

    this.lastAttemptAt = this.now()
  }

  private retryDelay(response: Response | undefined, attempt: number) {
    const retryAfter = parseRetryAfter(response?.headers.get('retry-after') || null)
    if (retryAfter !== undefined) return retryAfter

    return Math.min(this.retryBaseDelayMs * 2 ** attempt, this.maxRetryDelayMs)
  }
}
