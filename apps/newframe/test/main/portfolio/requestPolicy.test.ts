import ProviderRequestPolicy from '../../../main/portfolio/requestPolicy'

function createResponse(status = 200, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 429 ? 'Too Many Requests' : 'OK',
    headers: {
      get: (name: string) => headers[name.toLowerCase()] || null
    },
    json: async () => ({}),
    text: async () => ''
  } as Response
}

describe('ProviderRequestPolicy', () => {
  it('spaces requests by the configured minimum interval', async () => {
    let now = 0
    const sleeps: number[] = []
    const fetchMock = jest.fn(() => {
      now += 10
      return Promise.resolve(createResponse())
    })
    const policy = new ProviderRequestPolicy(fetchMock as unknown as typeof fetch, {
      minIntervalMs: 1000,
      maxRetries: 0,
      now: () => now,
      sleep: async (ms) => {
        sleeps.push(ms)
        now += ms
      }
    })

    await policy.request('https://api.example/first')
    await policy.request('https://api.example/second')

    expect(sleeps).toEqual([990])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('retries throttled requests after Retry-After while preserving the global request interval', async () => {
    let now = 0
    const sleeps: number[] = []
    const fetchMock = jest
      .fn()
      .mockImplementationOnce(() => {
        now += 10
        return Promise.resolve(createResponse(429, { 'retry-after': '2' }))
      })
      .mockImplementationOnce(() => {
        now += 10
        return Promise.resolve(createResponse())
      })
    const policy = new ProviderRequestPolicy(fetchMock as unknown as typeof fetch, {
      minIntervalMs: 1000,
      maxRetries: 1,
      now: () => now,
      sleep: async (ms) => {
        sleeps.push(ms)
        now += ms
      }
    })

    const response = await policy.request('https://api.example/throttled')

    expect(response.status).toBe(200)
    expect(sleeps).toEqual([2000])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
