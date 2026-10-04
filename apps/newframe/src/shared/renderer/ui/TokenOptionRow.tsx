import { Stack } from '@newframe/ui/stack'
import { Text } from '@newframe/ui/text'

import type { TokenImageCapability } from '../capabilities.ts'
import ChainTokenIcon from './ChainTokenIcon.tsx'
import type { ChainLike, ChainMetaLike, TokenSelectorItem } from './tokenSelectorTypes.ts'

interface TokenOptionRowProps {
  imageCapability: TokenImageCapability
  item: TokenSelectorItem
  chains: Record<string | number, ChainLike>
  chainsMeta: Record<string | number, ChainMetaLike>
  showRightSubLabel?: boolean
}

export default function TokenOptionRow({
  imageCapability,
  item,
  chains,
  chainsMeta,
  showRightSubLabel = false
}: TokenOptionRowProps) {
  const symbol = item.symbol || '?'

  return (
    <Stack align='center' direction='row' gap='large' grow>
      <ChainTokenIcon
        chainId={item.chainId}
        imageCapability={imageCapability}
        logoURI={item.logoURI}
        chains={chains}
        chainsMeta={chainsMeta}
        size='md'
        symbol={symbol}
        tokenId={item.id}
      />
      <Stack gap='xsmall' grow>
        <Text variant='control' truncate>
          {symbol}
        </Text>
        <Text variant='detail' tone='muted' truncate>
          {item.amountLabel}
        </Text>
      </Stack>
      <Stack align='end' gap='xsmall'>
        <Text align='end' variant='control' truncate>
          {item.notionalLabel}
        </Text>
        {showRightSubLabel && item.rightSubLabel ? (
          <Text
            align='end'
            variant='detail'
            tone={item.rightSubLabel.trim().startsWith('-') ? 'danger' : 'accent'}
            truncate
          >
            {item.rightSubLabel}
          </Text>
        ) : null}
      </Stack>
    </Stack>
  )
}
