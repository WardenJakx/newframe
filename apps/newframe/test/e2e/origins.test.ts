import { afterEach, beforeEach, expect, it, mock } from 'bun:test'

import provider from '../../main/provider/connection'

const persistMock = {
  get: mock(),
  set: mock(),
  queue: mock(),
  clear: mock(),
  writeUpdates: mock()
}

mock.module('../../main/store/persist', () => ({ default: persistMock, ...persistMock }))

let frame: any

beforeEach((done) => {
  frame = provider('frame', { origin: 'frame.test' })
  frame.once('connect', () => {
    frame.request({ method: 'eth_accounts', params: [] }).then(() => done())
  })
})

afterEach(() => {
  frame.removeAllListeners('chainChanged')
  frame.close()
})

it(
  'should be able to change the chain for a given origin',
  async () => {
    const [chains, currentChainId] = await Promise.all([
      frame.request({ method: 'wallet_getEthereumChains' }),
      frame.request({ method: 'eth_chainId' })
    ])

    const targetChain = chains.find((c: any) => c.chainId !== parseInt(currentChainId))

    if (!targetChain) throw new Error('no available chains to switch to!')

    return new Promise<void>((resolve, reject) => {
      frame.on('chainChanged', async (updatedChainId: any) => {
        try {
          expect(parseInt(updatedChainId)).toBe(targetChain.chainId)

          const chainId = await frame.request({ method: 'eth_chainId' })
          expect(parseInt(chainId)).toBe(targetChain.chainId)
          resolve()
        } catch (e) {
          reject(e)
        }
      })

      frame.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: targetChain.chainId }]
      })
    })
  },
  5 * 1000
)
