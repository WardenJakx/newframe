import { Stack } from '@newframe/ui/stack'
import { Text } from '@newframe/ui/text'

import ChainTokenIcon from './ChainTokenIcon'
import type { NetworkLike, NetworkMetaLike, TokenSelectorItem } from './tokenSelectorTypes'

interface TokenOptionRowProps {
  item: TokenSelectorItem
  networks: Record<string | number, NetworkLike>
  networksMeta: Record<string | number, NetworkMetaLike>
  showRightSubLabel?: boolean
}

export default function TokenOptionRow({
  item,
  networks,
  networksMeta,
  showRightSubLabel = false
}: TokenOptionRowProps) {
  const symbol = item.symbol || '?'

  return (
    <Stack align='center' direction='row' gap='large' grow>
      <ChainTokenIcon
        chainId={item.chainId}
        logoURI={item.logoURI}
        networks={networks}
        networksMeta={networksMeta}
        size='md'
        symbol={symbol}
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
