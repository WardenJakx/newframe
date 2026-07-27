import provider from '../../../apps/newframe/main/provider/connection.ts'

async function main() {
  const frame = provider('frame', { origin: 'frame.test' })

  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timed out connecting to Newframe')), 10_000)
      frame.once('connect', () => {
        clearTimeout(timeout)
        resolve()
      })
      frame.once('error', reject)
    })
    await frame.request({ method: 'eth_accounts', params: [] })

    const [chains, currentChainId] = (await Promise.all([
      frame.request({ method: 'wallet_getEthereumChains' }),
      frame.request({ method: 'eth_chainId' })
    ])) as [{ chainId: number }[], string]

    const targetChain = chains.find((c: any) => c.chainId !== parseInt(currentChainId))

    if (!targetChain) throw new Error('no available chains to switch to!')

    return new Promise<void>((resolve, reject) => {
      frame.on('chainChanged', async (updatedChainId: any) => {
        try {
          if (parseInt(updatedChainId) !== targetChain.chainId) {
            throw new Error(`chainChanged emitted ${updatedChainId}; expected ${targetChain.chainId}`)
          }

          const chainId = String(await frame.request({ method: 'eth_chainId' }))
          if (parseInt(chainId) !== targetChain.chainId) {
            throw new Error(`eth_chainId returned ${chainId}; expected ${targetChain.chainId}`)
          }
          console.log(JSON.stringify({ from: currentChainId, to: chainId, origin: 'frame.test' }))
          resolve()
        } catch (e) {
          reject(e)
        }
      })

      void frame.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: targetChain.chainId }]
      })
    })
  } finally {
    frame.removeAllListeners('chainChanged')
    frame.close()
  }
}

await main()
