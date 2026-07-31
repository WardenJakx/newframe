import { describe, expect, it } from 'bun:test'

import { createInitialSendState, INITIAL_SEND_TOKEN_ROWS, sendReducer } from './sendReducer'

describe('sendReducer account changes', () => {
  it('clears account-specific workflow state while retaining a valid asset choice', () => {
    const dirty = {
      ...createInitialSendState('old-asset'),
      amount: '42',
      error: 'Transaction failed.',
      recipient: { id: 'recipient' },
      recipientInput: 'recipient.eth',
      recipientOpen: false,
      status: 'Confirm in Newframe',
      submitting: true,
      tokenOpen: true,
      tokenRowsVisible: 500
    }

    const changed = sendReducer(dirty, { type: 'accountChanged', selectedAssetKey: 'valid-asset' })

    expect(changed).toEqual({
      ...createInitialSendState('valid-asset'),
      amount: '',
      tokenRowsVisible: INITIAL_SEND_TOKEN_ROWS
    })
  })

  it('clears a stale asset when the next account has no valid choice', () => {
    const changed = sendReducer(createInitialSendState('stale-asset'), {
      type: 'accountChanged',
      selectedAssetKey: ''
    })

    expect(changed.selectedAssetKey).toBe('')
    expect(changed.amount).toBe('')
  })
})
