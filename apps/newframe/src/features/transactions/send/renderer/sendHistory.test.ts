import { describe, expect, it } from 'bun:test'

import { hasSentToAddress } from './sendHistory'

const sender = '0x0000000000000000000000000000000000000001'
const recipient = '0x0000000000000000000000000000000000000002'
const token = '0x00000000000000000000000000000000000000bb'

function activity(record: Record<string, unknown>) {
  return {
    transaction: {
      id: 'transaction',
      status: 'succeeded' as const,
      account: sender,
      ...record
    }
  }
}

describe('hasSentToAddress', () => {
  it('matches a prior native transfer case-insensitively', () => {
    expect(
      hasSentToAddress({
        activity: activity({ data: { to: recipient.toUpperCase() } }),
        recipientAddress: recipient,
        senderAddress: sender.toUpperCase()
      })
    ).toBe(true)
  })

  it('matches the recipient of a prior token transfer instead of its token contract', () => {
    const tokenActivity = activity({
      data: { to: token },
      recognizedActions: [{ id: 'erc20:transfer', data: { recipient: { address: recipient } } }]
    })

    expect(
      hasSentToAddress({ activity: tokenActivity, recipientAddress: recipient, senderAddress: sender })
    ).toBe(true)
    expect(
      hasSentToAddress({ activity: tokenActivity, recipientAddress: token, senderAddress: sender })
    ).toBe(false)
  })

  it('falls back to decoding an ERC-20 transfer from saved calldata', () => {
    const calldata = `0xa9059cbb${recipient.slice(2).padStart(64, '0')}${'1'.padStart(64, '0')}`

    expect(
      hasSentToAddress({
        activity: activity({ data: { to: token, data: calldata } }),
        recipientAddress: recipient,
        senderAddress: sender
      })
    ).toBe(true)
  })

  it('ignores reverted sends and sends made from another account', () => {
    expect(
      hasSentToAddress({
        activity: activity({ status: 'reverted', data: { to: recipient } }),
        recipientAddress: recipient,
        senderAddress: sender
      })
    ).toBe(false)
    expect(
      hasSentToAddress({
        activity: activity({
          account: '0x0000000000000000000000000000000000000003',
          data: { to: recipient }
        }),
        recipientAddress: recipient,
        senderAddress: sender
      })
    ).toBe(false)
  })
})
