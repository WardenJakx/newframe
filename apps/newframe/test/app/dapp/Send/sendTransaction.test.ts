import { NATIVE_CURRENCY } from '../../../../resources/constants'
import {
  buildProviderSendPayload,
  buildSendOrigin,
  buildSendTransaction,
  cleanAddress,
  encodeErc20Transfer,
  frameOriginId,
  shouldResolveName
} from '../../../../app/dapp/Send/sendTransaction'

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
        account: { address: '0xsender' },
        amount: 10n,
        asset: { address: NATIVE_CURRENCY, chainId: 1 },
        recipientAddress: '0xrecipient'
      })
    ).toEqual({
      from: '0xsender',
      to: '0xrecipient',
      value: '0xa',
      chainId: '0x1'
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
        account: { address: '0xsender' },
        amount: 1n,
        asset: {
          address: '0x00000000000000000000000000000000000000bb',
          chainId: 31337
        },
        recipientAddress: recipient
      })
    ).toEqual({
      from: '0xsender',
      to: '0x00000000000000000000000000000000000000bb',
      value: '0x0',
      data:
        '0xa9059cbb' +
        '00000000000000000000000000000000000000000000000000000000000000aa' +
        '0000000000000000000000000000000000000000000000000000000000000001',
      chainId: '0x7a69'
    })
  })

  it('builds provider payloads with the internal Send origin', () => {
    const transaction = {
      from: '0xsender',
      to: '0xrecipient',
      value: '0x1',
      chainId: '0x1'
    }

    expect(buildProviderSendPayload({ chainId: 1, id: 123, transaction })).toEqual({
      id: 123,
      jsonrpc: '2.0',
      method: 'eth_sendTransaction',
      chainId: '0x1',
      params: [transaction],
      _origin: frameOriginId
    })

    expect(buildSendOrigin(1)).toEqual({
      name: 'newframe-internal',
      chain: { id: 1, type: 'ethereum' }
    })
  })
})
