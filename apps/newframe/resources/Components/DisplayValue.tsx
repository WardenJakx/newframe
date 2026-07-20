import {
  displayValueData,
  type DisplayValueData,
  type DisplayValueDataParams,
  type SourceValue
} from '../utils/displayValue'
import { MAX_HEX } from '../constants'
import { Text } from '@newframe/ui/text'

import { cva } from '../styled-system/css/cva.js'

function isDisplayValueData(obj: unknown): obj is DisplayValueData {
  if (!obj || typeof obj !== 'object') return false
  const candidate = obj as Partial<DisplayValueData>
  return Boolean(candidate.fiat && candidate.ether && candidate.gwei && candidate.wei && 'bn' in candidate)
}

const displayValueRecipe = cva({
  base: {
    display: 'inline-flex',
    minWidth: 0,
    alignItems: 'baseline',
    gap: '2',
    whiteSpace: 'nowrap'
  }
})

type DisplayCoinBalanceProps = {
  amount: SourceValue | DisplayValueData
  symbol: string
  decimals?: number
}

export const DisplayCoinBalance = ({ amount, symbol, decimals }: DisplayCoinBalanceProps) => (
  <DisplayValue
    type='ether'
    value={amount}
    currencySymbol={symbol}
    currencySymbolPosition='last'
    valueDataParams={{ decimals }}
  />
)

interface DisplayValueProps {
  value: SourceValue | DisplayValueData
  valueDataParams?: Partial<DisplayValueDataParams>
  currencySymbol?: string
  type?: 'fiat' | 'ether' | 'gwei' | 'wei'
  displayDecimals?: boolean
  currencySymbolPosition?: 'first' | 'last'
}

type RenderedValue = {
  displayValue: string
  approximationSymbol?: string
  displayUnit?: { shortName: string }
}

export const DisplayValue = (props: DisplayValueProps) => {
  const {
    value,
    valueDataParams,
    currencySymbol,
    type = 'ether',
    displayDecimals = true,
    currencySymbolPosition = 'first'
  } = props

  const data = isDisplayValueData(value) ? value : displayValueData(value, valueDataParams)

  const rendered: RenderedValue =
    value === MAX_HEX ? { displayValue: 'Unlimited' } : data[type]({ displayDecimals })
  const approximationSymbol = rendered.approximationSymbol || ''
  const displayUnit = rendered.displayUnit
  const { displayValue } = rendered

  return (
    <span className={displayValueRecipe()} data-testid='display-value'>
      {type === 'fiat' ? (
        <>
          {approximationSymbol && <Text variant='caption'>{approximationSymbol}</Text>}
          {currencySymbol && <Text variant='caption'>{currencySymbol}</Text>}
        </>
      ) : (
        <>
          {currencySymbol && currencySymbolPosition === 'first' && (
            <Text variant='caption'>{currencySymbol.toUpperCase()}</Text>
          )}
          {approximationSymbol && <Text variant='caption'>{approximationSymbol}</Text>}
        </>
      )}
      <Text variant='numeric' truncate>
        {displayValue}
      </Text>
      {displayUnit && <Text variant='caption'>{displayUnit.shortName}</Text>}
      {currencySymbol && currencySymbolPosition === 'last' && (
        <Text variant='caption'>{currencySymbol.toUpperCase()}</Text>
      )}
    </span>
  )
}
