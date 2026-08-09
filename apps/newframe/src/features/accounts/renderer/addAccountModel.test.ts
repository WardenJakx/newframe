import { expect, it } from 'bun:test'

import { hardwarePageModel } from './addAccountModel'

it('clamps hardware pages and requests only missing live Ledger addresses', () => {
  const ledger = { type: 'ledger', addresses: ['one', 'two', 'three', 'four', 'five'] }
  expect(hardwarePageModel(ledger, -2, true)).toMatchObject({
    page: 1,
    maxPage: 20,
    start: 0,
    addresses: ledger.addresses,
    loading: false
  })
  expect(hardwarePageModel(ledger, 2, true)).toMatchObject({
    page: 2,
    start: 5,
    requiredAddressCount: 10,
    addresses: [],
    missingAddresses: true,
    loading: true
  })
  expect(hardwarePageModel(ledger, 999, false)).toMatchObject({ page: 20, loading: false })
  expect(hardwarePageModel({ type: 'trezor', addresses: Array(11).fill('address') }, 9)).toMatchObject({
    page: 3,
    maxPage: 3,
    start: 10,
    addresses: ['address']
  })
})
