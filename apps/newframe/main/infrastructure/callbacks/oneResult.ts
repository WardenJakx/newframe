export type OneResultCallback<T> = (error: unknown, value?: T) => void

export function createOneResultCallbackBoundary() {
  let disposed = false
  const pending = new Set<(error: Error) => void>()

  return {
    run<T>(register: (callback: OneResultCallback<T>) => void) {
      return new Promise<T>((resolve, reject) => {
        if (disposed) {
          reject(new Error('Callback boundary is disposed'))
          return
        }

        let settled = false
        const settle = (complete: () => void) => {
          if (settled) return
          settled = true
          pending.delete(shutdown)
          complete()
        }
        const shutdown = (error: Error) => settle(() => reject(error))
        pending.add(shutdown)

        try {
          register((error, value) => {
            if (error) {
              settle(() => reject(error))
            } else if (value === undefined) {
              settle(() => reject(new Error('Operation returned no result')))
            } else {
              settle(() => resolve(value))
            }
          })
        } catch (error) {
          settle(() => reject(error))
        }
      })
    },

    dispose() {
      if (disposed) return
      disposed = true
      const error = new Error('Callback boundary was disposed before the operation completed')
      for (const reject of [...pending]) reject(error)
      pending.clear()
    }
  }
}
