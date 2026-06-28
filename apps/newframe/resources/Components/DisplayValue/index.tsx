import { displayValueData } from '../../utils/displayValue'
import { MAX_HEX } from '../../constants'

function isDisplayValueData(obj: any) {
  return Boolean(obj?.fiat && obj?.ether && obj?.gwei && obj?.wei) && typeof obj === 'object' && 'bn' in obj
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

export const DisplayCoinBalance = ({
  amount,
  symbol,
  decimals
}: {
  amount: any
  symbol: string
  decimals?: number
}) => (
  <DisplayValue
    type='ether'
    value={amount}
    currencySymbol={symbol}
    currencySymbolPosition='last'
    valueDataParams={{ decimals }}
  />
)

interface DisplayValueProps {
  value: any
  valueDataParams?: any
  currencySymbol?: string
  type?: string
  displayDecimals?: boolean
  currencySymbolPosition?: 'first' | 'last'
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

  const data: any = isDisplayValueData(value) ? value : displayValueData(value, valueDataParams)

  const {
    approximationSymbol = '',
    displayValue,
    displayUnit = ''
  } = value === MAX_HEX ? { displayValue: 'Unlimited' } : data[type]({ displayDecimals })

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
