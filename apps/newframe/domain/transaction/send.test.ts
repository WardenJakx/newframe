import { describe, expect, it } from 'bun:test'

import { NATIVE_CURRENCY } from '../token/constants'
import { buildSendTransaction, encodeErc20Transfer } from './send'

describe('send transaction construction', () => {
  it('constructs native and ERC-20 transfers from validated final intent', () => {
    expect(
      buildSendTransaction({
        amount: 10n,
        asset: { address: NATIVE_CURRENCY, chainId: 1 },
        recipientAddress: '0x00000000000000000000000000000000000000aa'
      })
    ).toEqual({
      to: '0x00000000000000000000000000000000000000aa',
      value: '0xa'
    })

    expect(encodeErc20Transfer('0x00000000000000000000000000000000000000aa', 1n)).toBe(
      '0xa9059cbb' +
        '00000000000000000000000000000000000000000000000000000000000000aa' +
        '0000000000000000000000000000000000000000000000000000000000000001'
    )
    expect(
      buildSendTransaction({
        amount: 1n,
        asset: { address: '0x00000000000000000000000000000000000000bb', chainId: 31337 },
        recipientAddress: '0x00000000000000000000000000000000000000aa'
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
