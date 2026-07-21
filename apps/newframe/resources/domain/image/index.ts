export function imageSource(target?: string) {
  return target || ''
}

export function isEmbeddedImage(target?: string) {
  return /^data:image\/[a-z0-9.+-]+;base64,/i.test(target || '')
}
