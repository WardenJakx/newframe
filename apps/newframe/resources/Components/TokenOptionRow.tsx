import { AssetSelectorPanel, type AssetSelectorVariant } from '@newframe/ui/asset-selector'

import ChainTokenIcon from './ChainTokenIcon'
import type { NetworkLike, NetworkMetaLike, TokenSelectorItem } from './tokenSelectorTypes'

interface TokenOptionRowProps {
  item: TokenSelectorItem
  networks: Record<string | number, NetworkLike>
  networksMeta: Record<string | number, NetworkMetaLike>
  showRightSubLabel?: boolean
}

function rightSubLabelVariants(label = ''): AssetSelectorVariant[] {
  if (label.trim().startsWith('-')) {
    return ['tokenOptionRowRightSubLabel', 'tokenOptionRowRightSubLabelDown']
  }

  return ['tokenOptionRowRightSubLabel', 'tokenOptionRowRightSubLabelUp']
}

export default function TokenOptionRow({
  item,
  networks,
  networksMeta,
  showRightSubLabel = false
}: TokenOptionRowProps) {
  const symbol = item.symbol || '?'

  return (
    <AssetSelectorPanel variants='tokenOptionRow'>
      <ChainTokenIcon
        chainId={item.chainId}
        logoURI={item.logoURI}
        networks={networks}
        networksMeta={networksMeta}
        size='md'
        symbol={symbol}
      />
      <AssetSelectorPanel variants='tokenOptionRowText'>
        <AssetSelectorPanel variants='tokenOptionRowSymbol'>{symbol}</AssetSelectorPanel>
        <AssetSelectorPanel variants='tokenOptionRowAmount'>{item.amountLabel}</AssetSelectorPanel>
      </AssetSelectorPanel>
      <AssetSelectorPanel variants='tokenOptionRowRight'>
        <AssetSelectorPanel variants='tokenOptionRowNotional'>{item.notionalLabel}</AssetSelectorPanel>
        {showRightSubLabel && item.rightSubLabel ? (
          <AssetSelectorPanel variants={rightSubLabelVariants(item.rightSubLabel)}>
            {item.rightSubLabel}
          </AssetSelectorPanel>
        ) : null}
      </AssetSelectorPanel>
    </AssetSelectorPanel>
  )
}
