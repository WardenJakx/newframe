import { getFlashDefaultChainId, isFlashChainSupported } from '@newframe/flash/chains'
import { useShallow } from 'zustand/react/shallow'

import { useWalletSelector } from '../../../platform/state-sync/renderer/useAppSelector.tsx'
import { toCanonicalAssetId } from '../../../shared/domain/sideTray.ts'
import { hasPositiveBalance } from '../../asset-data/domain/balance/index.ts'
import type { PortfolioCapability } from './portfolioCapability.ts'

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
  const { chains, runtime, isSafe } = useWalletSelector(
    useShallow((state) => ({
      isSafe: Boolean(
        Object.keys((state.accounts as Partial<typeof state.accounts>)[state.currentAccount]?.safe ?? {})
          .length
      ),
      chains: state.chains.ethereum,
      runtime: state.runtime
    }))
  )
  const chainEnabled = (chainId: number) => !!chains[chainId]?.on
  const firstTradeAsset = balances.find((balance) => {
    const chainId = Number(balance.chainId)
    return (
      hasPositiveBalance(balance) &&
      Number.isInteger(chainId) &&
      chainEnabled(chainId) &&
      isFlashChainSupported(chainId, runtime)
    )
  })
  const tradeChainId = (asset?: PortfolioActionAsset) => {
    const assetChainId = Number(asset?.chainId)
    if (Number.isInteger(assetChainId) && assetChainId > 0) {
      return assetChainId
    }
    if (firstTradeAsset) {
      return Number(firstTradeAsset.chainId)
    }
    if (selectedChainId > 0) {
      return selectedChainId
    }
    return getFlashDefaultChainId(runtime)
  }
  const canTrade = (asset?: PortfolioActionAsset) => {
    const contextAsset = asset ?? firstTradeAsset
    if (isSafe || !contextAsset) {
      return false
    }
    const chainId = tradeChainId(contextAsset)
    return chainEnabled(chainId) && isFlashChainSupported(chainId, runtime)
  }

  return {
    sendDisabledReason: isSafe
      ? 'Safe accounts are watch-only. Sending is unavailable.'
      : 'No assets available',
    canSend: (asset?: PortfolioActionAsset) =>
      !isSafe && (asset ? hasPositiveBalance(asset) : balances.some(hasPositiveBalance)),
    canTrade,
    openSend: (asset?: PortfolioActionAsset) => {
      if (isSafe || (asset ? !hasPositiveBalance(asset) : !balances.some(hasPositiveBalance))) {
        return
      }
      void capability.openSideTray({ feature: 'send', assetId: toCanonicalAssetId(asset) })
    },
    openTrade: (asset?: PortfolioActionAsset) => {
      const contextAsset = asset ?? firstTradeAsset
      if (!contextAsset || !canTrade(contextAsset)) {
        return
      }
      void capability.openSideTray({
        feature: 'trade',
        assetId: asset ? toCanonicalAssetId(asset) : '',
        chainId: tradeChainId(contextAsset)
      })
    }
  }
}
