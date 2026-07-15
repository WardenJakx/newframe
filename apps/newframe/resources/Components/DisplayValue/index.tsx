import {
  displayValueData,
  type DisplayValueData,
  type DisplayValueDataParams,
  type SourceValue
} from '../../utils/displayValue'
import { MAX_HEX } from '../../constants'

function isDisplayValueData(obj: unknown): obj is DisplayValueData {
  if (!obj || typeof obj !== 'object') return false
  const candidate = obj as Partial<DisplayValueData>
  return Boolean(candidate.fiat && candidate.ether && candidate.gwei && candidate.wei && 'bn' in candidate)
}

const ApproximateValue = ({ approximationSymbol }: { approximationSymbol: string }) => (
  <span className='displayValueApprox'>{approximationSymbol}</span>
)

const FiatSymbol = ({ fiatSymbol }: { fiatSymbol: string }) => (
  <span className='displayValueFiat'>{fiatSymbol}</span>
)

const Symbol = ({ currencySymbol }: { currencySymbol: string }) => (
  <span className='displayValueSymbol'>{currencySymbol.toUpperCase()}</span>
)

const Main = ({ displayValue }: { displayValue: string }) => (
  <span className='displayValueMain'>{displayValue}</span>
)

const Unit = ({ displayUnit }: { displayUnit: { shortName: string } }) => (
  <span className='displayValueUnit'>{displayUnit.shortName}</span>
)

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
    <div className='displayValue' data-testid='display-value'>
      {type === 'fiat' ? (
        <>
          {approximationSymbol && <ApproximateValue approximationSymbol={approximationSymbol} />}
          {currencySymbol && <FiatSymbol fiatSymbol={currencySymbol} />}
        </>
      ) : (
        <>
          {currencySymbol && currencySymbolPosition === 'first' && <Symbol currencySymbol={currencySymbol} />}
          {approximationSymbol && <ApproximateValue approximationSymbol={approximationSymbol} />}
        </>
      )}
      <Main displayValue={displayValue} />
      {displayUnit && <Unit displayUnit={displayUnit} />}
      {currencySymbol && currencySymbolPosition === 'last' && <Symbol currencySymbol={currencySymbol} />}
    </div>
  )
}
