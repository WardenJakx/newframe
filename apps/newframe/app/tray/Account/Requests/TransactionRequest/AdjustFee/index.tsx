import React, { useRef, useState } from 'react'

import link from '../../../../../../resources/link'
import { usesBaseFee } from '../../../../../../resources/domain/transaction'
import { formatUnits, parseUnits, toBigInt } from '../../../../../../resources/utils/numbers'

// display a wei value as a decimal amount of gwei
function toDisplayFromWei(wei: any) {
  return formatUnits(wei, 9)
}

function bnToHex(bn: any) {
  return `0x${bn.toString(16)}`
}

function limitRange(bn: any, min = 0n, max = 9999000000000n) {
  if (bn > max) return max
  if (bn < min) return min
  return bn
}

// value is wei for gwei-denominated inputs, integer units otherwise
function formatForInput(value: any, decimals: any) {
  return decimals ? toDisplayFromWei(value) : value.toString()
}

// parse user input into wei for gwei-denominated inputs, integer units
// otherwise, truncating anything beyond 9 decimal places
function parseInput(value: any, decimals: any) {
  return decimals ? parseUnits(value, 9) : toBigInt(value)
}

function getMaxTotalFee(tx: any = { chainId: '' }) {
  const chainId = parseInt(tx.chainId)

  // for ETH-based chains, the max fee should be 2 ETH
  if ([1, 3, 4, 5, 6, 10, 42, 61, 62, 63, 69, 8453, 42161, 421611, 7777777].includes(chainId)) {
    return 2 * 1e18
  }

  // for Fantom, the max fee should be 250 FTM
  if ([250, 4002].includes(chainId)) {
    return 250 * 1e18
  }

  // for all other chains, default to 50 of the chain's currency
  return 50 * 1e18
}

const totalFee = ({ gasPrice, baseFee, priorityFee, gasLimit }: any) =>
  gasPrice !== undefined ? gasPrice * gasLimit : (baseFee + priorityFee) * gasLimit

const limitGasUnits = (bn: any) => limitRange(bn, 0n, 12500000n)
type FeeField = 'baseFee' | 'priorityFee' | 'gasPrice' | 'gasLimit'

let submitTimeout: any = null

const FeeOverlayInput = ({ initialValue, labelText, tabIndex, decimals, onReceiveValue, limiter }: any) => {
  const [value, setValue] = useState(initialValue)
  const labelId = `txFeeOverlayLabel_${tabIndex}`

  // newValue is wei for gwei-denominated inputs, integer units otherwise
  const submitValue = (newValueStr: any, newValue: any) => {
    setValue(newValueStr)

    clearTimeout(submitTimeout)

    submitTimeout = setTimeout(() => {
      const limitedValue = limiter(newValue)
      onReceiveValue(limitedValue)
      setValue(formatForInput(limitedValue, decimals))
    }, 500)
  }

  return (
    <>
      <div className='txFeeOverlayInput'>
        <input
          tabIndex={tabIndex}
          value={value}
          className='txFeeOverlayInput'
          aria-labelledby={labelId}
          onChange={(e) => {
            const parsedInput: any = (decimals ? /[0-9.]*/ : /[0-9]*/).exec(e.target.value)
            const enteredValue = parsedInput[0] || ''

            if (enteredValue === '.' || enteredValue === '') return setValue(enteredValue)

            const numericValue = parseInput(e.target.value, decimals)
            if (numericValue === undefined) return

            clearTimeout(submitTimeout)

            // prevent decimal point being overwritten as user is typing a float
            if (enteredValue.endsWith('.')) {
              const formattedNum = formatForInput(parseInput(enteredValue.slice(0, -1), decimals), decimals)

              return setValue(`${formattedNum}.`)
            }

            submitValue(enteredValue, numericValue)
          }}
          onKeyDown={(e: any) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              e.target.blur()
            } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault()
              const parsedValue = parseInput(value, decimals)
              if (parsedValue === undefined) {
                return
              }

              // adjust by 1 gwei for gwei-denominated inputs, 1000 units otherwise
              const step = decimals ? 1000000000n : 1000n
              const newValue = e.key === 'ArrowUp' ? parsedValue + step : parsedValue - step

              const limitedValue = limiter(newValue)
              submitValue(formatForInput(limitedValue, decimals), limitedValue)
            }
          }}
        />
      </div>
      <div id={labelId} className='txFeeOverlayLabel'>
        {labelText}
      </div>
    </>
  )
}

const GasLimitInput = ({ initialValue, onReceiveValue, tabIndex, limiter }: any) => (
  <div className='txFeeOverlayLimit'>
    <FeeOverlayInput
      initialValue={initialValue}
      onReceiveValue={onReceiveValue}
      labelText='Gas Limit (UNITS)'
      tabIndex={tabIndex}
      decimals={false}
      limiter={limiter}
    />
  </div>
)

const GasPriceInput = ({ initialValue, onReceiveValue, tabIndex, limiter }: any) => (
  <div className='txFeeOverlayGasPrice'>
    <FeeOverlayInput
      initialValue={initialValue}
      onReceiveValue={onReceiveValue}
      labelText='Gas Price (GWEI)'
      tabIndex={tabIndex}
      decimals={true}
      limiter={limiter}
    />
  </div>
)

const BaseFeeInput = ({ initialValue, onReceiveValue, tabIndex, limiter }: any) => (
  <div className='txFeeOverlayBaseFee'>
    <FeeOverlayInput
      initialValue={initialValue}
      onReceiveValue={onReceiveValue}
      labelText='Base Fee (GWEI)'
      tabIndex={tabIndex}
      decimals={true}
      limiter={limiter}
    />
  </div>
)

const PriorityFeeInput = ({ initialValue, onReceiveValue, tabIndex, limiter }: any) => (
  <div className='txFeeOverlayPriorityFee'>
    <FeeOverlayInput
      initialValue={initialValue}
      onReceiveValue={onReceiveValue}
      labelText='Max Priority Fee (GWEI)'
      tabIndex={tabIndex}
      decimals={true}
      limiter={limiter}
    />
  </div>
)

export default function TxFeeOverlay(props: any) {
  const {
    req: {
      data: { gasLimit: initialGasLimit, maxPriorityFeePerGas, maxFeePerGas, gasPrice: initialGasPrice }
    }
  } = props
  const moduleRef = useRef<HTMLDivElement>(null)
  const maxFee = toBigInt(maxFeePerGas) ?? 0n
  const initialPriorityFee = toBigInt(maxPriorityFeePerGas) ?? 0n
  const [state, setState] = useState({
    gasLimit: toBigInt(initialGasLimit) ?? 0n,
    gasPrice: toBigInt(initialGasPrice) ?? 0n,
    baseFee: maxFee - initialPriorityFee,
    priorityFee: initialPriorityFee
  })

  const {
    req: { data, handlerId }
  } = props
  const { baseFee, gasLimit, priorityFee, gasPrice } = state
  const maxTotalFee = BigInt(getMaxTotalFee(data))

  const displayBaseFee = toDisplayFromWei(baseFee)
  const baseFeeLimiter = (rawBaseFee: any) => {
    const { priorityFee, gasLimit } = state
    // if total fee > maximum allowed fee we recalculate the base fee based on the maximum allowed
    if (totalFee({ baseFee: rawBaseFee, priorityFee, gasLimit }) > maxTotalFee) {
      rawBaseFee = maxTotalFee / gasLimit - priorityFee
    }

    return limitRange(rawBaseFee)
  }

  const displayPriorityFee = toDisplayFromWei(priorityFee)
  const priorityFeeLimiter = (rawPriorityFee: any) => {
    const { baseFee, gasLimit } = state
    // if total fee > maximum allowed fee we recalculate the priority fee based on the maximum allowed
    if (totalFee({ baseFee, priorityFee: rawPriorityFee, gasLimit }) > maxTotalFee) {
      rawPriorityFee = maxTotalFee / gasLimit - baseFee
    }

    return limitRange(rawPriorityFee)
  }

  const displayGasPrice = toDisplayFromWei(gasPrice)
  const gasPriceLimiter = (rawGasPrice: any) => {
    const { gasLimit } = state
    // if total fee > maximum allowed fee we recalculate the gas price based on the maximum allowed
    if (totalFee({ gasPrice: rawGasPrice, gasLimit }) > maxTotalFee) {
      rawGasPrice = maxTotalFee / gasLimit
    }

    return limitRange(rawGasPrice)
  }

  const displayGasLimit = gasLimit.toString()
  const gasLimitLimiter = (rawGasLimit: any) => {
    const { baseFee, priorityFee, gasPrice } = state
    // if total fee > maximum allowed fee we recalculate the gas limit based on the maximum allowed
    if (gasPrice && totalFee({ gasPrice, gasLimit: rawGasLimit }) > maxTotalFee) {
      rawGasLimit = maxTotalFee / gasPrice
    } else if (totalFee({ baseFee, priorityFee, gasLimit: rawGasLimit }) > maxTotalFee) {
      rawGasLimit = maxTotalFee / (baseFee + priorityFee)
    }

    return limitGasUnits(rawGasLimit)
  }

  const receiveValueHandler = (value: bigint, name: FeeField) => {
    setState((current) => ({ ...current, [name]: value }))

    void link.executeCommand({
      type: 'transaction.fee-update',
      requestId: handlerId,
      field: name,
      value: bnToHex(value)
    })
  }

  return (
    <div className='txAdjustFee cardShow' ref={moduleRef}>
      {usesBaseFee(data) ? (
        <>
          <BaseFeeInput
            initialValue={displayBaseFee}
            onReceiveValue={(value: any) => receiveValueHandler(value, 'baseFee')}
            limiter={baseFeeLimiter}
            tabIndex={0}
          />
          <PriorityFeeInput
            initialValue={displayPriorityFee}
            onReceiveValue={(value: any) => receiveValueHandler(value, 'priorityFee')}
            limiter={priorityFeeLimiter}
            tabIndex={1}
          />
        </>
      ) : (
        <GasPriceInput
          initialValue={displayGasPrice}
          onReceiveValue={(value: any) => receiveValueHandler(value, 'gasPrice')}
          limiter={gasPriceLimiter}
          tabIndex={0}
        />
      )}
      <GasLimitInput
        initialValue={displayGasLimit}
        onReceiveValue={(value: any) => receiveValueHandler(value, 'gasLimit')}
        limiter={gasLimitLimiter}
        tabIndex={2}
      />
    </div>
  )
}
