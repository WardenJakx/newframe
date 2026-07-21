import { expect, it } from 'bun:test'

import { render, screen } from '@testing-library/react'

import TxOverview from '../../../../../../../app/tray/Account/Requests/TransactionRequest/TxMainNew/overview'

it('renders a simple request summary without the expanded request provider', () => {
  render(
    <TxOverview req={{ classification: 'NATIVE_TRANSFER', data: { value: '0x0' } }} simple symbol='ETH' />
  )

  expect(screen.getByText('Send')).toBeTruthy()
})
