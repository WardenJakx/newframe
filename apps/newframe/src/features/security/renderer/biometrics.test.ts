import { describe, expect, it } from 'bun:test'

import { getCredentialExtensionResults } from './biometrics'

describe('getCredentialExtensionResults', () => {
  it('returns an empty result for null and malformed credentials', () => {
    const credentials: unknown[] = [null, {}, { getClientExtensionResults: 'not callable' }]
    const results = credentials.map(getCredentialExtensionResults)

    expect(results).toEqual([{}, {}, {}])
  })

  it('returns an empty result for malformed and partial method results', () => {
    const methodResults: unknown[] = [null, 'invalid', [], { prf: null }, { prf: { results: {} } }]
    const results = methodResults.map((result) =>
      getCredentialExtensionResults({ getClientExtensionResults: () => result })
    )

    expect(results).toEqual([{}, {}, {}, {}, {}])
  })

  it('returns an empty result when extension result access throws', () => {
    const failure = new Error('credential internals stay local')
    const result = getCredentialExtensionResults({
      getClientExtensionResults() {
        throw failure
      }
    })

    expect(result).toEqual({})
  })

  it('invokes a valid method with its credential receiver and preserves usable extension output', () => {
    const receivers: unknown[] = []
    const first = new Uint8Array([1, 2, 3])
    const extensionResult = { prf: { results: { first } } }
    const credential = {
      getClientExtensionResults(this: unknown) {
        receivers.push(this)
        return extensionResult
      }
    }

    const result = getCredentialExtensionResults(credential)

    expect({ receivers, result }).toEqual({ receivers: [credential], result: extensionResult })
  })
})
