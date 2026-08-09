type CloseObservable = {
  once(event: 'close', listener: () => void): unknown
}

export class PendingConnectionLimiter {
  private reservations = 0

  constructor(
    private readonly limit: number,
    private readonly pendingCount: () => number
  ) {}

  tryReserve() {
    if (!this.hasCapacity()) return false
    this.reservations += 1
    return true
  }

  release() {
    if (this.reservations > 0) this.reservations -= 1
  }

  hasCapacity() {
    return this.pendingCount() + this.reservations < this.limit
  }
}

export function observeResponseClose(
  response: CloseObservable,
  isPending: () => boolean,
  disconnect: () => void
) {
  response.once('close', () => {
    if (isPending()) disconnect()
  })
}
