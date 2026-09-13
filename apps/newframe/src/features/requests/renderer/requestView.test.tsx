import { afterEach, expect, it } from 'bun:test'

import { useEffect } from 'react'

import { act, cleanup, render } from '../../../../test/support/componentSetup'
import { GasFeesSource } from '../../transactions/domain'
import { RequestStatus } from '../contract/requests'
import { RequestViewProvider, useRequestView } from './requestView'

afterEach(cleanup)
const original = {
  data: {
    chainId: '0x1',
    type: '0x2',
    gasFeesSource: GasFeesSource.Dapp,
    gasLimit: '0x5208',
    maxFeePerGas: '0x7',
    maxPriorityFeePerGas: '0x3'
  }
}

it('shares a synchronous fee draft through Back, preserves it across canonical updates, and resets on unmount', () => {
  let view: ReturnType<typeof useRequestView>
  function Probe() {
    const context = useRequestView()
    useEffect(() => {
      view = context
    }, [context])
    return null
  }
  const utils = render(
    <RequestViewProvider>
      <Probe />
    </RequestViewProvider>
  )
  expect(view!.displayRequest(original)).toBe(original)
  act(() => {
    view.open({ step: 'adjustFee' })
    view.updateFee(original, 'baseFee', 5n)
    view.updateFee(original, 'priorityFee', 4n)
    view.dismissFeeNotice()
  })
  act(() => {
    view.back()
  })
  expect(view!.step).toBe('confirm')
  expect(view!.feeNoticeDismissed).toBeTrue()
  expect(view!.adjustments).toEqual({ gasLimit: '0x5208', maxFeePerGas: '0x9', maxPriorityFeePerGas: '0x4' })
  const automatic = { data: { ...original.data, maxFeePerGas: '0x20', gasLimit: '0x6000' } }
  expect(view!.displayRequest(automatic).data).toEqual({
    ...original.data,
    maxFeePerGas: '0x9',
    maxPriorityFeePerGas: '0x4'
  })
  expect(original.data.maxFeePerGas).toBe('0x7')
  expect(view!.displayRequest({ ...automatic, locked: true }).data).toBe(automatic.data)
  expect(view!.displayRequest({ ...automatic, status: RequestStatus.Pending }).data).toBe(automatic.data)
  utils.unmount()
  render(
    <RequestViewProvider>
      <Probe />
    </RequestViewProvider>
  )
  expect(view!.adjustments).toBeUndefined()
  expect(view!.feeNoticeDismissed).toBeFalse()
  expect(view!.displayRequest(automatic)).toBe(automatic)
})

it('derives presets locally from recommendations and preserves the chosen level', () => {
  let view: ReturnType<typeof useRequestView>
  function Probe() {
    const context = useRequestView()
    useEffect(() => {
      view = context
    }, [context])
    return null
  }
  render(
    <RequestViewProvider>
      <Probe />
    </RequestViewProvider>
  )
  act(() =>
    view.selectFeeLevel(original, 'fast', { fees: { maxBaseFeePerGas: '0x8', maxPriorityFeePerGas: '0x4' } })
  )
  expect(view!.adjustments).toEqual({ gasLimit: '0x5208', maxFeePerGas: '0xf', maxPriorityFeePerGas: '0x5' })
  expect(view!.feeLevel).toBe('fast')
  expect(original.data.maxFeePerGas).toBe('0x7')
})
