import log from 'electron-log'

export interface Request {
  execute: () => Promise<unknown>
  type: string
}

export class RequestQueue {
  private running = false
  private processing = false
  private requestQueue: Array<Request> = []

  add(request: Request) {
    this.requestQueue.push(request)
    void this.runNext()
  }

  private async runNext() {
    if (!this.running || this.processing) return
    const request = this.requestQueue.shift()
    if (!request) return

    this.processing = true
    try {
      await request.execute()
    } catch (err) {
      log.warn('Ledger request queue caught unexpected error', err)
    } finally {
      this.processing = false
      void this.runNext()
    }
  }

  start() {
    this.running = true
    void this.runNext()
  }

  stop() {
    this.running = false
  }

  close() {
    this.stop()
    this.clear()
  }

  clear() {
    this.requestQueue = []
  }

  peekBack() {
    return this.requestQueue[this.requestQueue.length - 1]
  }
}
