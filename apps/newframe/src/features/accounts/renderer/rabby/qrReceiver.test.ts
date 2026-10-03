import { expect, it } from 'bun:test'

import { UR, UREncoder } from '@ngraveio/bc-ur'
import { gzipSync, strToU8 } from 'fflate'

import { createRabbyQrReceiver } from './qrReceiver'

it('reassembles real Rabby raw-gzip UR fragments out of order with duplicates and uppercase frames', () => {
  const data = JSON.stringify({
    vault: { data: 'encrypted-data'.repeat(300), iv: 'iv', salt: 'salt' },
    alianNames: [{ address: `0x${'1'.repeat(40)}`, name: 'Savings' }],
    highligtedAddresses: [],
    whitelist: []
  })
  const encoder = new UREncoder(new UR(Buffer.from(gzipSync(strToU8(data))), 'bytes'), 40)
  const frames = Array.from({ length: encoder.fragmentsLength }, () => encoder.nextPart()).reverse()
  expect(frames.length).toBeGreaterThan(1)
  const receiver = createRabbyQrReceiver()
  const first = receiver.receive(frames[0].toUpperCase())
  expect(first.complete).toBe(false)
  expect(receiver.receive(frames[0])).toEqual(first)
  let result = first
  for (const frame of frames.slice(1)) {
    result = receiver.receive(frame.toUpperCase())
  }
  expect(result).toEqual({ complete: true, data })
})

it('rejects unrelated QR types, oversized fragment sequences, invalid gzip and oversized decompressed exports', () => {
  for (const frame of ['ethereum:0x1234', 'ur:crypto-account/abcd', 'ur:bytes/1-5001/abcd']) {
    expect(() => createRabbyQrReceiver().receive(frame)).toThrow()
  }
  const invalid = new UREncoder(new UR(Buffer.from('not gzip'), 'bytes'), 200)
  expect(() => createRabbyQrReceiver().receive(invalid.nextPart())).toThrow('Could not read the Rabby export')
  const large = gzipSync(strToU8(JSON.stringify({ vault: {}, padding: 'x'.repeat(4_000_001) })))
  const encoder = new UREncoder(new UR(Buffer.from(large), 'bytes'), 200)
  const receiver = createRabbyQrReceiver()
  expect(() => {
    for (let index = 0; index < encoder.fragmentsLength; index += 1) {
      receiver.receive(encoder.nextPart())
    }
  }).toThrow('Could not read the Rabby export')
})
