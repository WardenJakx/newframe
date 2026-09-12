import { Stack } from '@newframe/ui/stack'
import { Text } from '@newframe/ui/text'
import type { CSSProperties, ReactNode } from 'react'

import { cva } from '../../../../../generated/styled-system/css/cva.js'
import { chainColorValue } from '../../../networks/domain/chain/colors'

const chainRecipe = cva({ base: { color: 'var(--request-chain-color)' } })

const RequestHeader = ({
  chain,
  children,
  chainColor
}: {
  chain: string
  children?: ReactNode
  chainColor: string
}) => (
  <Stack align='center' gap='xsmall'>
    {children}
    <span
      className={chainRecipe()}
      style={{ '--request-chain-color': chainColorValue(chainColor) } as CSSProperties}
    >
      <Text as='span' variant='overline'>{`on ${chain}`}</Text>
    </span>
  </Stack>
)

export default RequestHeader
