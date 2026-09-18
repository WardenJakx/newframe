export const MAX_EMBEDDED_IMAGE_BYTES = 1024 * 1024

const supportedImageMimeTypes = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'image/x-icon',
  'image/vnd.microsoft.icon'
])

const embeddedImagePattern = /^data:([^;,]+);base64,([a-z0-9+/]*={0,2})$/i
const maxEmbeddedImageSourceLength = Math.ceil((MAX_EMBEDDED_IMAGE_BYTES * 4) / 3) + 64

export function isSupportedImageMimeType(value: string) {
  return supportedImageMimeTypes.has(value.toLowerCase())
}

export function embeddedImageSource(value: unknown) {
  if (typeof value !== 'string') {
    return ''
  }
  const source = value.trim()
  if (source.length > maxEmbeddedImageSourceLength) {
    return ''
  }
  const match = source.match(embeddedImagePattern)
  if (!match?.[1] || match[2] === undefined || !isSupportedImageMimeType(match[1])) {
    return ''
  }

  const base64 = match[2]
  if (base64.length % 4 === 1) {
    return ''
  }
  let padding = 0
  if (base64.endsWith('==')) {
    padding = 2
  } else if (base64.endsWith('=')) {
    padding = 1
  }
  const decodedBytes = Math.floor((base64.length * 3) / 4) - padding
  return decodedBytes <= MAX_EMBEDDED_IMAGE_BYTES ? source : ''
}

export function imageSource(target?: string) {
  const source = target?.trim() ?? ''
  return isEmbeddedImage(source) ? source : ''
}

export function isEmbeddedImage(target?: string) {
  return /^data:image\/[a-z0-9.+-]+;base64,/i.test(target ?? '')
}

export function persistedImageSource(image?: { base64?: string; mimeType?: string }) {
  return image?.base64 && image.mimeType ? `data:${image.mimeType};base64,${image.base64}` : ''
}
