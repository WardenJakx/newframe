import { describe, expect, it } from 'bun:test'

import {
  canProceed,
  getAmountBaseUnits,
  getRecipientAddress,
  validateSendRequest
} from '../../../../app/sidetray/Send/sendValidation'

const validAddress = '0x00000000000000000000000000000000000000aa'

describe('sendValidation', () => {
  it('parses amounts in asset base units', () => {
    expect(getAmountBaseUnits('1.5', { decimals: 6 })).toBe(1500000n)
  })

  it('resolves selected or typed recipient addresses', () => {
    expect(getRecipientAddress({ recipient: { address: '  0xABCDEF  ' } })).toBe('0xabcdef')
    expect(getRecipientAddress({ recipientInput: `  0x${validAddress.slice(2).toUpperCase()}  ` })).toBe(
      validAddress
    )
    expect(getRecipientAddress({ recipientInput: 'vitalik.eth' })).toBe('')
  })

  it('preserves Proceed enablement behavior', () => {
    const asset = {
      balance: '1000000',
      decimals: 6
    }

    expect(canProceed({ amount: '1', asset, recipientInput: validAddress })).toBe(true)
    expect(canProceed({ amount: '2', asset, recipientInput: validAddress })).toBe(false)
    expect(canProceed({ amount: '1', asset, recipientInput: 'vitalik.eth' })).toBe(true)
    expect(canProceed({ amount: '1', asset, recipientInput: 'two words' })).toBe(false)
  })

  it('returns the existing submit validation messages', () => {
    expect(
      validateSendRequest({
        account: null,
        amount: 1n,
        asset: { balance: '1', decimals: 0 },
        balance: 1n,
        recipientAddress: validAddress
      })
    ).toBe('Enter an amount to send.')

    expect(
      validateSendRequest({
        account: { address: '0xsender' },
        amount: 2n,
        asset: { balance: '1', decimals: 0 },
        balance: 1n,
        recipientAddress: validAddress
      })
    ).toBe('Amount exceeds available balance.')

    expect(
      validateSendRequest({
        account: { address: '0xsender' },
        amount: 1n,
        asset: { balance: '1', decimals: 0 },
        balance: 1n,
        recipientAddress: ''
      })
    ).toBe('Enter a valid recipient.')
  })
})
