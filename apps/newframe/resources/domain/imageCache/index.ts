export type ImageCacheType = 'icon' | 'nft'

const IMAGE_CACHE_URL = 'http://localhost:8421/__frame/image-cache'
const IMAGE_CACHE_REFERENCE_PREFIX = 'frame-cache:'

export function cachedImageReference(type: ImageCacheType, key: string) {
  return `${IMAGE_CACHE_REFERENCE_PREFIX}${type}:${key}`
}

export function parseCachedImageReference(target?: string) {
  const match = (target || '').match(/^frame-cache:(icon|nft):([a-f0-9]{64})$/)
  if (!match) return undefined

  return {
    type: match[1] as ImageCacheType,
    key: match[2]
  }
}

export function isCachedImageReference(target?: string) {
  return Boolean(parseCachedImageReference(target))
}

export function cachedImageUrl(target?: string, type: ImageCacheType = 'icon') {
  if (!target) return ''

  const cached = parseCachedImageReference(target)
  const params = cached
    ? new URLSearchParams({
        type: cached.type,
        key: cached.key
      })
    : new URLSearchParams({
        type,
        target
      })

  return `${IMAGE_CACHE_URL}?${params.toString()}`
}
