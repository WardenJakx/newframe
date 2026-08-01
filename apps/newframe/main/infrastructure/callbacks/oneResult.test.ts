import { describe, expect, it } from 'bun:test'

import { createOneResultCallbackBoundary, type OneResultCallback } from './oneResult'

describe('one-result callback boundary', () => {
  it('settles once when a legacy callback fires more than once', async () => {
    const boundary = createOneResultCallbackBoundary()
    const result = boundary.run<string>((done) => {
      done(null, 'first')
      done(new Error('late failure'))
      done(null, 'late value')
    })

    await expect(result).resolves.toBe('first')
    boundary.dispose()
  })

  it('rejects pending and future work on shutdown and ignores late callbacks', async () => {
    const boundary = createOneResultCallbackBoundary()
    let done: OneResultCallback<string> = () => undefined
    const pending = boundary.run<string>((callback) => {
      done = callback
    })

    boundary.dispose()
    done(null, 'late value')

    await expect(pending).rejects.toThrow('disposed before the operation completed')
    await expect(boundary.run<string>(() => undefined)).rejects.toThrow('is disposed')
  })
})
