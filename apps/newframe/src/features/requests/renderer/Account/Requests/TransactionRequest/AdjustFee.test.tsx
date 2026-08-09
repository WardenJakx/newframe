import { afterEach, beforeEach, expect, it, jest as timers } from 'bun:test'

import type { TransactionRequest } from '../../../../contract/requests'
import { act, cleanup, fireEvent, render, screen } from '../../../../../../../test/support/componentSetup'
import { createHostFixture } from '../../../../../../../test/support/rendererClient'
import { gweiToHex } from '../../../../../../../test/support/util'
import AdjustFee from './AdjustFee'

const linkMock = createHostFixture()

function request(data: Partial<TransactionRequest['data']> = {}): TransactionRequest {
  return {
    type: 'transaction',
    handlerId: 'request-1',
    origin: 'https://example.test',
    account: '0x0000000000000000000000000000000000000001',
    approvals: [],
    payload: { method: 'eth_sendTransaction', params: [] },
    data: {
      type: '0x2',
      chainId: '0x1',
      gasFeesSource: 'Dapp',
      gasLimit: '0x61a8',
      maxPriorityFeePerGas: gweiToHex(3),
      maxFeePerGas: gweiToHex(7),
      ...data
    }
  } as unknown as TransactionRequest
}

function input(label: string) {
  return screen.getByLabelText<HTMLInputElement>(label)
}

function flushDebounce() {
  act(() => timers.advanceTimersByTime(500))
}

beforeEach(() => {
  timers.useFakeTimers()
})

afterEach(() => {
  cleanup()
  timers.useRealTimers()
})

it('renders the EIP-1559 fee projection as accessible inputs', () => {
  render(<AdjustFee req={request()} />)

  expect({
    baseFee: input('Base Fee (GWEI)').value,
    priorityFee: input('Max Priority Fee (GWEI)').value,
    gasLimit: input('Gas Limit (UNITS)').value,
    gasPricePresent: screen.queryByLabelText('Gas Price (GWEI)') !== null
  }).toStrictEqual({
    baseFee: '4',
    priorityFee: '3',
    gasLimit: '25000',
    gasPricePresent: false
  })
})

it('renders the legacy gas-price projection instead of EIP-1559 fields', () => {
  render(
    <AdjustFee
      req={request({
        type: '0x0',
        gasPrice: gweiToHex(7),
        maxPriorityFeePerGas: undefined,
        maxFeePerGas: undefined
      })}
    />
  )

  expect({
    gasPrice: input('Gas Price (GWEI)').value,
    gasLimit: input('Gas Limit (UNITS)').value,
    baseFeePresent: screen.queryByLabelText('Base Fee (GWEI)') !== null
  }).toStrictEqual({ gasPrice: '7', gasLimit: '25000', baseFeePresent: false })
})

it('normalizes decimal precision and sends one typed fee command after the debounce', () => {
  render(<AdjustFee req={request()} />)
  const baseFee = input('Base Fee (GWEI)')

  fireEvent.change(baseFee, { target: { value: '9.222222222222222' } })
  expect(baseFee.value).toBe('9.222222222222222')
  expect(linkMock.executeCommand).not.toHaveBeenCalled()

  flushDebounce()

  expect(baseFee.value).toBe('9.222222222')
  expect(linkMock.executeCommand).toHaveBeenCalledTimes(1)
  expect(linkMock.executeCommand).toHaveBeenCalledWith({
    type: 'transaction.fee-update',
    requestId: 'request-1',
    field: 'baseFee',
    value: gweiToHex(9.222222222)
  })
})

it('keeps incomplete decimal input local until it becomes a value', () => {
  render(<AdjustFee req={request()} />)
  const baseFee = input('Base Fee (GWEI)')

  fireEvent.change(baseFee, { target: { value: '' } })
  fireEvent.change(baseFee, { target: { value: '.' } })
  flushDebounce()

  expect(baseFee.value).toBe('.')
  expect(linkMock.executeCommand).not.toHaveBeenCalled()
})

it('debounces fee fields independently and emits their observable commands', () => {
  render(<AdjustFee req={request()} />)

  fireEvent.change(input('Base Fee (GWEI)'), { target: { value: '5' } })
  fireEvent.change(input('Max Priority Fee (GWEI)'), { target: { value: '4' } })
  flushDebounce()

  expect(linkMock.executeCommand.mock.calls.map(([command]) => command)).toStrictEqual([
    {
      type: 'transaction.fee-update',
      requestId: 'request-1',
      field: 'baseFee',
      value: gweiToHex(5)
    },
    {
      type: 'transaction.fee-update',
      requestId: 'request-1',
      field: 'priorityFee',
      value: gweiToHex(4)
    }
  ])
})

it('cancels pending fee commands when the editor unmounts', () => {
  render(<AdjustFee req={request()} />)

  fireEvent.change(input('Base Fee (GWEI)'), { target: { value: '5' } })
  cleanup()
  act(() => timers.runAllTimers())

  expect(linkMock.executeCommand).not.toHaveBeenCalled()
})

it('steps gwei and gas-unit inputs using their user-facing increments', () => {
  render(<AdjustFee req={request()} />)
  const baseFee = input('Base Fee (GWEI)')
  const gasLimit = input('Gas Limit (UNITS)')

  fireEvent.keyDown(baseFee, { key: 'ArrowUp' })
  fireEvent.keyDown(gasLimit, { key: 'ArrowDown' })
  flushDebounce()

  expect({ baseFee: baseFee.value, gasLimit: gasLimit.value }).toStrictEqual({
    baseFee: '5',
    gasLimit: '24000'
  })
  expect(linkMock.executeCommand.mock.calls.map(([command]) => command)).toStrictEqual([
    {
      type: 'transaction.fee-update',
      requestId: 'request-1',
      field: 'baseFee',
      value: gweiToHex(5)
    },
    {
      type: 'transaction.fee-update',
      requestId: 'request-1',
      field: 'gasLimit',
      value: '0x5dc0'
    }
  ])
})

it('blurs the active fee field when Enter is pressed', () => {
  render(<AdjustFee req={request()} />)
  const gasLimit = input('Gas Limit (UNITS)')

  gasLimit.focus()
  fireEvent.keyDown(gasLimit, { key: 'Enter' })

  expect(document.activeElement).not.toBe(gasLimit)
})
