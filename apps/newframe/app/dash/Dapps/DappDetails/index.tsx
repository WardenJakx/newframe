import { useCallback } from 'react'
import link from '../../../../resources/link'
import RingIcon from '../../../../resources/Components/RingIcon'
import svg from '../../../../resources/svg'
import { useWalletSelector } from '../../../state/useAppSelector'
import type { DashChain, DashChainMetadata, DashRendererState } from '../../state'

const EMPTY_CHAINS: Record<string | number, DashChain> = {}
const EMPTY_CHAIN_METADATA: Record<string | number, DashChainMetadata> = {}

interface DappDetailsProps {
  originId: string
}

export default function DappDetails({ originId }: DappDetailsProps) {
  const selectOrigin = useCallback((state: DashRendererState) => state.origins[originId], [originId])
  const origin = useWalletSelector(selectOrigin)
  const chains = useWalletSelector((state: DashRendererState) => state.networks.ethereum || EMPTY_CHAINS)
  const chainMetadata = useWalletSelector(
    (state: DashRendererState) => state.networksMeta.ethereum || EMPTY_CHAIN_METADATA
  )

  if (!origin) return null

  const chainOptions = Object.values(chains).filter((chain) => chain.on)

  return (
    <div className='cardShow'>
      <div className='originSwapOrigin'>
        {svg.window(20)}
        <div className='originSwapOriginText'>{origin.name}</div>
      </div>
      <div className='originSwapTitle'>default chain</div>
      <div className='originSwapChainList'>
        {chainOptions.map((chain) => {
          const selected = origin.chain.id === chain.id
          const { primaryColor, icon } = chainMetadata[chain.id] || {}

          return (
            <div
              key={chain.id}
              className='originChainItem'
              onClick={() => {
                void link.executeCommand({
                  type: 'origin.switch-chain',
                  originId,
                  chainId: Number(chain.id)
                })
              }}
            >
              <div className='originChainItemIcon'>
                <RingIcon color={`var(--${primaryColor})`} img={icon} />
              </div>
              {chain.name}
              <div className='originChainItemCheck'>{selected ? svg.check(28) : null}</div>
            </div>
          )
        })}
      </div>
      <div
        className='clearOriginsButton'
        style={{ color: 'var(--color-status-danger)' }}
        onClick={() => {
          void link.executeCommand({ type: 'origin.remove', originId })
        }}
      >
        Clear Website
      </div>
    </div>
  )
}
