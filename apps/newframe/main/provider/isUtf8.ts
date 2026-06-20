const isContinuationByte = (byte: number | undefined) => byte !== undefined && byte >= 0x80 && byte <= 0xbf

export default function isUtf8(buffer?: Buffer | Uint8Array) {
  if (!buffer) return false

  let i = 0
  while (i < buffer.length) {
    const byte = buffer[i]

    if (byte <= 0x7f) {
      i += 1
    } else if (byte >= 0xc2 && byte <= 0xdf && isContinuationByte(buffer[i + 1])) {
      i += 2
    } else if (
      byte === 0xe0 &&
      buffer[i + 1] >= 0xa0 &&
      buffer[i + 1] <= 0xbf &&
      isContinuationByte(buffer[i + 2])
    ) {
      i += 3
    } else if (
      byte >= 0xe1 &&
      byte <= 0xec &&
      isContinuationByte(buffer[i + 1]) &&
      isContinuationByte(buffer[i + 2])
    ) {
      i += 3
    } else if (
      byte === 0xed &&
      buffer[i + 1] >= 0x80 &&
      buffer[i + 1] <= 0x9f &&
      isContinuationByte(buffer[i + 2])
    ) {
      i += 3
    } else if (
      byte >= 0xee &&
      byte <= 0xef &&
      isContinuationByte(buffer[i + 1]) &&
      isContinuationByte(buffer[i + 2])
    ) {
      i += 3
    } else if (
      byte === 0xf0 &&
      buffer[i + 1] >= 0x90 &&
      buffer[i + 1] <= 0xbf &&
      isContinuationByte(buffer[i + 2]) &&
      isContinuationByte(buffer[i + 3])
    ) {
      i += 4
    } else if (
      byte >= 0xf1 &&
      byte <= 0xf3 &&
      isContinuationByte(buffer[i + 1]) &&
      isContinuationByte(buffer[i + 2]) &&
      isContinuationByte(buffer[i + 3])
    ) {
      i += 4
    } else if (
      byte === 0xf4 &&
      buffer[i + 1] >= 0x80 &&
      buffer[i + 1] <= 0x8f &&
      isContinuationByte(buffer[i + 2]) &&
      isContinuationByte(buffer[i + 3])
    ) {
      i += 4
    } else {
      return false
    }
  }

  return true
}
