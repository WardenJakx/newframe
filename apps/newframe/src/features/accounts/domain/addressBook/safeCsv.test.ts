import { describe, expect, it } from 'bun:test'

import { parseSafeAddressBookCsv } from './safeCsv.ts'

describe('parseSafeAddressBookCsv', () => {
  it('reads a Safe export once per address with the first name winning', () => {
    const csv = [
      'address,name,chainId',
      '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045,Alice,1',
      '0xd8da6bf26964af9d7eed9e03e53415d37aa96045,Alice,10',
      '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045,Alice Later,137',
      '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48,"Treasury, main",1',
      '0xnotanaddress,Broken,1',
      '',
      '0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed,"Quoted ""inner"" name",1',
      ''
    ].join('\r\n')

    expect(parseSafeAddressBookCsv(csv)).toEqual({
      entries: [
        { address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', name: 'Alice' },
        { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', name: 'Treasury, main' },
        { address: '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed', name: 'Quoted "inner" name' }
      ],
      rows: 6,
      invalidRows: 1
    })
  })

  it('finds columns by header name, trims and truncates names, and rejects empty names', () => {
    const csv = [
      ' Name ,ChainId,ADDRESS',
      `  ${'x'.repeat(60)}  ,1,0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045`,
      '   ,1,0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
    ].join('\n')

    expect(parseSafeAddressBookCsv(csv)).toEqual({
      entries: [{ address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', name: 'x'.repeat(50) }],
      rows: 2,
      invalidRows: 1
    })
  })

  it('counts every row invalid when the header has no address column', () => {
    expect(parseSafeAddressBookCsv('label,chainId\nAlice,1\n')).toEqual({
      entries: [],
      rows: 1,
      invalidRows: 1
    })
  })
})
