export function imageSource(target?: string) {
  const source = target?.trim() || ''
  return isEmbeddedImage(source) ? source : ''
}

export function isEmbeddedImage(target?: string) {
  return /^data:image\/[a-z0-9.+-]+;base64,/i.test(target || '')
}

export function persistedImageSource(image?: { base64?: string; mimeType?: string }) {
  return image?.base64 && image.mimeType ? `data:${image.mimeType};base64,${image.base64}` : ''
}
