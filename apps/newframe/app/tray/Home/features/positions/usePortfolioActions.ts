import { useShallow } from 'zustand/react/shallow'

import link from '../../../../../resources/link'
import { hasPositiveBalance } from '../../../../../resources/domain/balance'
import { toCanonicalAssetId } from '../../../../../resources/domain/dappLauncher'
import { getFlashDefaultChainId, isFlashChainSupported } from '../../../../../resources/domain/flash/chains'
import { useWalletSelector } from '../../../../state/useAppSelector'
import { useHomeUiStore } from '../../state/HomeUiProvider'

const EMPTY_RECORD: Record<string, any> = {}
export const TRADE_DISABLED_CHAIN_LABEL = 'Trade unavailable on this chain'

export function usePortfolioActions(balances: any[]) {
  const { networks, runtime } = useWalletSelector(
    useShallow((state) => ({
      networks: state.networks?.ethereum || EMPTY_RECORD,
      runtime: state.runtime || EMPTY_RECORD
    }))
  )
  const selectedChainId = useHomeUiStore((state) => state.selectedChainId)
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
  const tradeChainId = (asset?: any) => {
    const assetChainId = Number(asset?.chainId)
    if (Number.isInteger(assetChainId) && assetChainId > 0) return assetChainId
    if (firstTradeAsset) return Number(firstTradeAsset.chainId)
    if (selectedChainId > 0) return selectedChainId
    return getFlashDefaultChainId(runtime)
  }
  const canTrade = (asset?: any) => {
    const contextAsset = asset || firstTradeAsset
    if (!contextAsset) return false
    const chainId = tradeChainId(contextAsset)
    return chainEnabled(chainId) && isFlashChainSupported(chainId, runtime)
  }

  return {
    canSend: (asset?: any) => (asset ? hasPositiveBalance(asset) : balances.some(hasPositiveBalance)),
    canTrade,
    openSend: (asset?: any) => {
      if (asset ? !hasPositiveBalance(asset) : !balances.some(hasPositiveBalance)) return
      void link.executeCommand({ type: 'dapp.open', feature: 'send', assetId: toCanonicalAssetId(asset) })
    },
    openTrade: (asset?: any) => {
      const contextAsset = asset || firstTradeAsset
      if (!contextAsset || !canTrade(contextAsset)) return
      void link.executeCommand({
        type: 'dapp.open',
        feature: 'trade',
        assetId: asset ? toCanonicalAssetId(asset) : '',
        chainId: tradeChainId(contextAsset)
      })
    }
  }
}
