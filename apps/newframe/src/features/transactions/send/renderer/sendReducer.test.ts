import { describe, expect, it } from 'bun:test'

import {
  createInitialSendState,
  INITIAL_SEND_TOKEN_ROWS,
  SEND_TOKEN_ROWS_INCREMENT,
  sendReducer,
  type SendWorkflowAction
} from './sendReducer'

describe('sendReducer account changes', () => {
  it('owns draft, recipient, token-menu, and validation transitions', () => {
    const recipient = { id: 'recipient', address: `0x${'2'.repeat(40)}` }
    const transitions: Array<[SendWorkflowAction, Record<string, unknown>]> = [
      [
        { type: 'setAmount', amount: '2.5' },
        { amount: '2.5', error: '' }
      ],
      [{ type: 'validationFailed', error: 'Invalid amount' }, { error: 'Invalid amount' }],
      [
        { type: 'selectRecipient', recipient },
        { recipient, recipientInput: '', recipientOpen: false }
      ],
      [{ type: 'clearRecipient' }, { recipient: null, recipientInput: '', recipientOpen: true }],
      [{ type: 'setRecipientInput', recipientInput: 'wallet.eth' }, { recipientInput: 'wallet.eth' }],
      [{ type: 'toggleRecipientOpen' }, { recipientOpen: false }],
      [
        { type: 'setTokenOpen', tokenOpen: true },
        { recipientOpen: false, tokenOpen: true }
      ],
      [
        { type: 'selectAsset', selectedAssetKey: '1:token' },
        { selectedAssetKey: '1:token', tokenOpen: false }
      ],
      [{ type: 'setMaxAmount', amount: '10' }, { amount: '10' }],
      [{ type: 'showMoreTokens' }, { tokenRowsVisible: INITIAL_SEND_TOKEN_ROWS + SEND_TOKEN_ROWS_INCREMENT }]
    ]

    let state = { ...createInitialSendState(), error: 'Old error' }
    for (const [action, expected] of transitions) {
      state = sendReducer(state, action)
      expect(state).toMatchObject(expected)
    }
  })

  it('clears account-specific workflow state while retaining a valid asset choice', () => {
    const dirty = {
      ...createInitialSendState('old-asset'),
      amount: '42',
      error: 'Transaction failed.',
      recipient: { id: 'recipient', address: `0x${'2'.repeat(40)}` },
      recipientInput: 'recipient.eth',
      recipientOpen: false,
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
