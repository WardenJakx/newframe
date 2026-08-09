import { useShallow } from 'zustand/react/shallow'

import { hasPositiveBalance } from '../../asset-data/domain/balance'
import { toCanonicalAssetId } from '../../../app/contracts/sidetray'
import { getFlashDefaultChainId, isFlashChainSupported } from '../../transactions/trade/domain/chains'
import { useWalletSelector } from '../../../platform/state-sync/renderer/useAppSelector'
import type { WalletRendererState } from '../../../platform/state-sync/contract/projections'
import type { PortfolioCapability } from './portfolioCapability'

const EMPTY_NETWORKS: WalletRendererState['networks']['ethereum'] = {}
const EMPTY_RUNTIME: WalletRendererState['runtime'] = {}
export const TRADE_DISABLED_CHAIN_LABEL = 'Trade unavailable on this chain'

type PortfolioActionAsset = {
  address: string
  balance: string
  chainId: number
}

export function usePortfolioActions(
  capability: Pick<PortfolioCapability, 'openSideTray'>,
  balances: PortfolioActionAsset[],
  selectedChainId: number
) {
  const { networks, runtime } = useWalletSelector(
    useShallow((state) => ({
      networks: state.networks?.ethereum || EMPTY_NETWORKS,
      runtime: state.runtime || EMPTY_RUNTIME
    }))
  )
  const chainEnabled = (chainId: number) => !!networks[chainId]?.on
  const firstTradeAsset = balances.find((balance) => {
    const chainId = Number(balance?.chainId)
    return (
      hasPositiveBalance(balance) &&
      Number.isInteger(chainId) &&
      chainEnabled(chainId) &&
      isFlashChainSupported(chainId, runtime)
    )
  })
  const tradeChainId = (asset?: PortfolioActionAsset) => {
    const assetChainId = Number(asset?.chainId)
    if (Number.isInteger(assetChainId) && assetChainId > 0) return assetChainId
    if (firstTradeAsset) return Number(firstTradeAsset.chainId)
    if (selectedChainId > 0) return selectedChainId
    return getFlashDefaultChainId(runtime)
  }
  const canTrade = (asset?: PortfolioActionAsset) => {
    const contextAsset = asset || firstTradeAsset
    if (!contextAsset) return false
    const chainId = tradeChainId(contextAsset)
    return chainEnabled(chainId) && isFlashChainSupported(chainId, runtime)
  }

  return {
    canSend: (asset?: PortfolioActionAsset) =>
      asset ? hasPositiveBalance(asset) : balances.some(hasPositiveBalance),
    canTrade,
    openSend: (asset?: PortfolioActionAsset) => {
      if (asset ? !hasPositiveBalance(asset) : !balances.some(hasPositiveBalance)) return
      void capability.openSideTray({ feature: 'send', assetId: toCanonicalAssetId(asset) })
    },
    openTrade: (asset?: PortfolioActionAsset) => {
      const contextAsset = asset || firstTradeAsset
      if (!contextAsset || !canTrade(contextAsset)) return
      void capability.openSideTray({
        feature: 'trade',
        assetId: asset ? toCanonicalAssetId(asset) : '',
        chainId: tradeChainId(contextAsset)
      })
    }
  }
}
