import { afterEach, expect, it, mock } from 'bun:test'

import { cleanup, fireEvent, render, screen } from '../../../../../../../test/support/componentSetup'
import { GasFeesSource } from '../../../../../transactions/domain'
import AdjustFee from './AdjustFee'

afterEach(cleanup)
const req = {
  handlerId: 'request-1',
  data: {
    chainId: '0x1',
    type: '0x2',
    gasFeesSource: GasFeesSource.Dapp,
    gasLimit: '0x61a8',
    maxFeePerGas: '0x1a13b8600',
    maxPriorityFeePerGas: '0xb2d05e00'
  }
}
const input = (label: string) => screen.getByLabelText<HTMLInputElement>(label)

it('stores precise valid edits immediately, including before unmount', () => {
  const onUpdateFee = mock()
  render(<AdjustFee req={req} onUpdateFee={onUpdateFee} />)
  fireEvent.change(input('Base Fee (GWEI)'), { target: { value: '5.123456789' } })
  expect(onUpdateFee).toHaveBeenLastCalledWith('baseFee', 5_123_456_789n)
  cleanup()
  expect(onUpdateFee).toHaveBeenCalledTimes(1)
})

it('keeps incomplete numeric text local and steps valid values with limits', () => {
  const onUpdateFee = mock()
  render(<AdjustFee req={req} onUpdateFee={onUpdateFee} />)
  fireEvent.change(input('Base Fee (GWEI)'), { target: { value: '.' } })
  expect(input('Base Fee (GWEI)').value).toBe('.')
  expect(onUpdateFee).not.toHaveBeenCalled()
  fireEvent.change(input('Base Fee (GWEI)'), { target: { value: '5' } })
  fireEvent.keyDown(input('Base Fee (GWEI)'), { key: 'ArrowUp' })
  expect(onUpdateFee).toHaveBeenLastCalledWith('baseFee', 6_000_000_000n)
  fireEvent.keyDown(input('Gas Limit (UNITS)'), { key: 'ArrowDown' })
  expect(onUpdateFee).toHaveBeenLastCalledWith('gasLimit', 24_000n)
  fireEvent.change(input('Gas Limit (UNITS)'), { target: { value: '999999999' } })
  expect(onUpdateFee).toHaveBeenLastCalledWith('gasLimit', 12_500_000n)
})

it('uses legacy prices and blurs on Enter', () => {
  const onUpdateFee = mock()
  render(
    <AdjustFee
      req={{ ...req, data: { ...req.data, type: '0x0', gasPrice: '0x3b9aca00' } }}
      onUpdateFee={onUpdateFee}
    />
  )
  const price = input('Gas Price (GWEI)')
  fireEvent.change(price, { target: { value: '2' } })
  expect(onUpdateFee).toHaveBeenLastCalledWith('gasPrice', 2_000_000_000n)
  price.focus()
  fireEvent.keyDown(price, { key: 'Enter' })
  expect(document.activeElement).not.toBe(price)
})
