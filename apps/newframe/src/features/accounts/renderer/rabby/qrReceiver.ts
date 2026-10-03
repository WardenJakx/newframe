import { URDecoder } from '@ngraveio/bc-ur'
import { Gunzip, strFromU8 } from 'fflate'

const maxCompressedBytes = 1_000_000
const maxEnvelopeBytes = 2_000_000
const invalidQr = 'This is not a Rabby Mobile Sync QR. In Rabby, choose Sync to mobile.'

function unzipEnvelope(bytes: Uint8Array) {
  let length = 0
  const chunks: Uint8Array[] = []
  const decoder = new Gunzip((chunk) => {
    length += chunk.length
    if (length > maxEnvelopeBytes) {
      throw new Error('This Rabby export is too large. Select fewer accounts and scan again.')
    }
    chunks.push(chunk)
  })
  for (let offset = 0; offset < bytes.length; offset += 1024) {
    decoder.push(bytes.subarray(offset, offset + 1024), offset + 1024 >= bytes.length)
  }
  const output = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.length
  }
  return strFromU8(output)
}

/** Rabby places raw gzip bytes in UR.cbor, without a CBOR byte-string wrapper. */
export function createRabbyQrReceiver() {
  const decoder = new URDecoder()
  const seen = new Set<string>()
  let receivedCharacters = 0
  return {
    receive(frame: string): { complete: false; progress: number } | { complete: true; data: string } {
      if (frame.length > 4096 || !frame.toLowerCase().startsWith('ur:bytes/')) {
        throw new Error(invalidQr)
      }
      const normalized = frame.toLowerCase()
      if (seen.has(normalized)) {
        return { complete: false, progress: decoder.getProgress() }
      }
      receivedCharacters += frame.length
      if (seen.size >= 10_000 || receivedCharacters > 8_000_000) {
        throw new Error('This QR stream is too large. Select fewer accounts in Rabby and scan again.')
      }
      seen.add(normalized)
      try {
        const [, components] = URDecoder.parse(normalized)
        if (components.length === 2) {
          const [sequence, count] = URDecoder.parseSequenceComponent(components[0])
          if (!Number.isSafeInteger(count) || count > 5000 || sequence > 1_000_000) {
            throw new Error(invalidQr)
          }
        }
        decoder.receivePart(frame)
      } catch {
        throw new Error(invalidQr)
      }
      if (decoder.isError()) {
        throw new Error('Could not read the Rabby QR. Scan it again.')
      }
      if (!decoder.isComplete()) {
        return { complete: false, progress: decoder.getProgress() }
      }
      const bytes = decoder.resultUR().cbor
      if (bytes.length > maxCompressedBytes) {
        throw new Error('This Rabby export is too large. Select fewer accounts and scan again.')
      }
      let data: string
      try {
        data = unzipEnvelope(bytes)
        const envelope: unknown = JSON.parse(data)
        if (!envelope || typeof envelope !== 'object' || !('vault' in envelope)) {
          throw new Error(invalidQr)
        }
      } catch {
        throw new Error('Could not read the Rabby export. Select the accounts in Rabby and scan again.')
      }
      return { complete: true, data }
    }
  }
}
