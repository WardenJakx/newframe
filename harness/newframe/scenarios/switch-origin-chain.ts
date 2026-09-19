import provider from '../../../apps/newframe/src/features/connections/main/provider/connection.ts'

type EthereumChain = {
  chainId: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function requireChains(value: unknown): EthereumChain[] {
  if (
    !Array.isArray(value) ||
    !value.every(
      (chain): chain is EthereumChain =>
        isRecord(chain) && typeof chain.chainId === 'number' && Number.isInteger(chain.chainId)
    )
  ) {
    throw new Error('wallet_getEthereumChains returned invalid chain data')
  }
  return value
}

function requireChainId(value: unknown, label: string) {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new Error(`${label} returned an invalid chain id`)
  }
  const parsed = typeof value === 'number' ? value : Number.parseInt(value)
  if (!Number.isInteger(parsed)) {
    throw new Error(`${label} returned an invalid chain id: ${value}`)
  }
  return { parsed, display: String(value) }
}

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

    const [chainsResult, currentChainIdResult] = await Promise.all([
      frame.request({ method: 'wallet_getEthereumChains' }),
      frame.request({ method: 'eth_chainId' })
    ])
    const chains = requireChains(chainsResult)
    const currentChainId = requireChainId(currentChainIdResult, 'eth_chainId')

    const targetChain = chains.find((chain) => chain.chainId !== currentChainId.parsed)

    if (!targetChain) {
      throw new Error('no available chains to switch to!')
    }

    return await new Promise<void>((resolve, reject) => {
      const checkChain = async (updatedChainId: unknown) => {
        if (requireChainId(updatedChainId, 'chainChanged').parsed !== targetChain.chainId) {
          throw new Error(`chainChanged emitted ${updatedChainId}; expected ${targetChain.chainId}`)
        }

        const chainIdResult = await frame.request({ method: 'eth_chainId' })
        const chainId = requireChainId(chainIdResult, 'eth_chainId')
        if (chainId.parsed !== targetChain.chainId) {
          throw new Error(`eth_chainId returned ${chainId.display}; expected ${targetChain.chainId}`)
        }
        console.log(
          JSON.stringify({
            from: currentChainId.display,
            to: chainId.display,
            origin: 'frame.test'
          })
        )
      }

      frame.on('chainChanged', (updatedChainId) => {
        checkChain(updatedChainId).then(resolve, reject)
      })

      frame
        .request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: targetChain.chainId }]
        })
        .catch(reject)
    })
  } finally {
    frame.removeAllListeners('chainChanged')
    frame.close()
  }
}

await main()
