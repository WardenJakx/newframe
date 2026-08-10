import { expect, it, mock } from 'bun:test'

import { render, screen } from '../../../../../test/support/componentSetup'
import { registerTestRuntimeFixture } from '../../../../../test/support/rendererClient'
import { SendView } from './SendView'
import type { SendViewEvents, SendViewModel } from './sendViewModel'
import { createSendCapabilityFake } from './sendService.test-support'

registerTestRuntimeFixture()

it('renders independent accessible recipient selection and copy controls', () => {
  const recipient = {
    id: 'recipient',
    address: `0x${'2'.repeat(40)}`,
    name: 'Recipient'
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

  const { user } = render(<SendView capability={createSendCapabilityFake()} events={events} model={model} />)
  const select = screen.getByRole('button', { name: 'Select Recipient' })
  const copy = screen.getByRole('button', { name: 'Copy address for 0x222222...222222' })

  expect(select.contains(copy)).toBe(false)
  return user.click(select).then(() => expect(selectRecipient).toHaveBeenCalledWith(recipient))
})
