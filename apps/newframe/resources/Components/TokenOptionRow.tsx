import React from 'react'

import ChainTokenIcon from './ChainTokenIcon'
import type { NetworkLike, NetworkMetaLike, TokenSelectorItem } from './tokenSelectorTypes'

interface TokenOptionRowProps {
  item: TokenSelectorItem
  networks: Record<string | number, NetworkLike>
  networksMeta: Record<string | number, NetworkMetaLike>
  showRightSubLabel?: boolean
}

function rightSubLabelClass(label = '') {
  if (label.trim().startsWith('-')) return 'tokenOptionRowRightSubLabel tokenOptionRowRightSubLabelDown'

  return 'tokenOptionRowRightSubLabel tokenOptionRowRightSubLabelUp'
}

export default function TokenOptionRow({
  item,
  networks,
  networksMeta,
  showRightSubLabel = false
}: TokenOptionRowProps) {
  const symbol = item.symbol || '?'

  return (
    <div className='tokenOptionRow'>
      <ChainTokenIcon
        chainId={item.chainId}
        logoURI={item.logoURI}
        networks={networks}
        networksMeta={networksMeta}
        size='md'
        symbol={symbol}
      />
      <div className='tokenOptionRowText'>
        <div className='tokenOptionRowSymbol'>{symbol}</div>
        <div className='tokenOptionRowAmount'>{item.amountLabel}</div>
      </div>
      <div className='tokenOptionRowRight'>
        <div className='tokenOptionRowNotional'>{item.notionalLabel}</div>
        {showRightSubLabel && item.rightSubLabel ? (
          <div className={rightSubLabelClass(item.rightSubLabel)}>{item.rightSubLabel}</div>
        ) : null}
      </div>
    </div>
  )
}
