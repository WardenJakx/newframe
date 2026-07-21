export function imageSource(target?: string) {
  const source = target?.trim() || ''
  return source.startsWith('frame-cache:') ? '' : source
}

export function isEmbeddedImage(target?: string) {
  return /^data:image\/[a-z0-9.+-]+;base64,/i.test(target || '')
}
