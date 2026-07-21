import { describe, expect, it } from 'bun:test'

import { NATIVE_CURRENCY } from '../../../../resources/constants'
import {
  buildSendTransaction,
  cleanAddress,
  encodeErc20Transfer,
  shouldResolveName
} from '../../../../app/sidetray/Send/sendTransaction'

describe('sendTransaction', () => {
  it('normalizes addresses and name-resolution candidates', () => {
    expect(cleanAddress('  0xABCDEF  ')).toBe('0xabcdef')
    expect(shouldResolveName('vitalik.eth')).toBe(true)
    expect(shouldResolveName('two words')).toBe(false)
    expect(shouldResolveName('')).toBe(false)
  })

  it('builds native transfer transactions', () => {
    expect(
      buildSendTransaction({
        amount: 10n,
        asset: { address: NATIVE_CURRENCY, chainId: 1 },
        recipientAddress: '0xrecipient'
      })
    ).toEqual({
      to: '0xrecipient',
      value: '0xa'
    })
  })

  it('builds ERC-20 transfer calldata transactions', () => {
    const recipient = '0x00000000000000000000000000000000000000aa'

    expect(encodeErc20Transfer(recipient, 1n)).toBe(
      '0xa9059cbb' +
        '00000000000000000000000000000000000000000000000000000000000000aa' +
        '0000000000000000000000000000000000000000000000000000000000000001'
    )

    expect(
      buildSendTransaction({
        amount: 1n,
        asset: {
          address: '0x00000000000000000000000000000000000000bb',
          chainId: 31337
        },
        recipientAddress: recipient
      })
    ).toEqual({
      to: '0x00000000000000000000000000000000000000bb',
      value: '0x0',
      data:
        '0xa9059cbb' +
        '00000000000000000000000000000000000000000000000000000000000000aa' +
        '0000000000000000000000000000000000000000000000000000000000000001'
    })
  })
})
