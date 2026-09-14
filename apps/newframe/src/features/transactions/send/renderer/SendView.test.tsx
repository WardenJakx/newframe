import { expect, it, mock } from 'bun:test'

import { render, screen } from '../../../../../test/support/componentSetup'
import { registerTestRuntimeFixture } from '../../../../../test/support/rendererClient'
import { createSendCapabilityFake } from './sendService.test-support'
import { SendView } from './SendView'
import type { SendViewEvents, SendViewModel } from './sendViewModel'

registerTestRuntimeFixture()

it('preserves Safe identity through recipient selection and keeps copy separate', async () => {
  const recipient = {
    id: 'recipient',
    address: `0x${'2'.repeat(40)}`,
    name: 'Recipient',
    lastSignerType: 'address',
    accountType: 'safe'
  }
  const selectRecipient = mock<SendViewEvents['onSelectRecipient']>(() => undefined)
  const noop = () => undefined
  const model: SendViewModel = {
    amount: '1',
    fiatValue: '$0.00',
    firstTimeRecipient: false,
    networks: {},
    networksMeta: {},
    recipient: null,
    recipientAccounts: [recipient],
    recipientInput: '',
    recipientOpen: true,
    rowsHidden: 0,
    searchableTokenItems: [],
    selectedAsset: {
      address: `0x${'e'.repeat(40)}`,
      balance: '1',
      chainId: 1,
      decimals: 18,
      displayBalance: '1',
      symbol: 'ETH'
    },
    selectedAssetKey: '',
    submission: { error: '', status: '', submitting: false },
    tokenItems: [],
    tokenOpen: false,
    validation: { error: '', proceedEnabled: false }
  }
  const events: SendViewEvents = {
    onAmountChange: noop,
    onClearRecipient: noop,
    onClose: noop,
    onRecipientInputChange: noop,
    onSelectAsset: noop,
    onSelectRecipient: selectRecipient,
    onSetMax: noop,
    onShowMoreTokens: noop,
    onSubmit: noop,
    onTokenPickerOpenChange: noop,
    onToggleRecipients: noop
  }

  const { user, rerender } = render(
    <SendView capability={createSendCapabilityFake()} events={events} model={model} />
  )
  const select = screen.getByRole('button', { name: 'Select Recipient' })
  const copy = screen.getByRole('button', { name: 'Copy address for 0x222222...222222' })

  expect(select.contains(copy)).toBe(false)
  const avatar = select.querySelector('[data-address-identity]')
  const source = avatar?.querySelector('img')?.getAttribute('src')
  expect(source).toStartWith('data:image/png;base64,')
  expect(avatar?.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 24 24')
  await user.click(select)
  expect(selectRecipient).toHaveBeenCalledWith(recipient)

  rerender(
    <SendView capability={createSendCapabilityFake()} events={events} model={{ ...model, recipient }} />
  )
  const selected = document.querySelector('[data-address-identity]')
  expect(selected?.querySelector('img')?.getAttribute('src')).toBe(source)
  expect(selected?.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 24 24')
  expect(screen.getByText('0x222222...222222')).toBeTruthy()

  rerender(
    <SendView
      capability={createSendCapabilityFake()}
      events={events}
      model={{ ...model, recipient: { id: 'external', address: recipient.address } }}
    />
  )
  const external = document.querySelector('[data-address-identity]')
  expect(external?.querySelector('img')?.getAttribute('src')).toBe(source)
  expect(external?.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 512 512')
  expect(external?.querySelectorAll('svg')).toHaveLength(1) // Copy control only; no invented type badge.
})
