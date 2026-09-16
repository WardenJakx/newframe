import { describe, expect, it } from 'bun:test'

import { embeddedImageSource, imageSource, isEmbeddedImage } from './index'

describe('image sources', () => {
  it('allows only embedded images in renderers', () => {
    expect(imageSource('data:image/png;base64,aWNvbg==')).toBe('data:image/png;base64,aWNvbg==')
    expect(imageSource('https://cdn.example/icon.png')).toBe('')
    expect(isEmbeddedImage(imageSource('data:image/png;base64,aWNvbg=='))).toBe(true)
  })

  it('rejects retired image-cache references', () => {
    expect(imageSource('frame-cache:icon:legacy')).toBe('')
  })

  it('accepts only bounded base64 data for supported image types', () => {
    expect(embeddedImageSource('data:image/png;base64,iVBORw0KGgo=')).toBe(
      'data:image/png;base64,iVBORw0KGgo='
    )
    expect(embeddedImageSource('data:text/html;base64,PGgxPm5vcGU8L2gxPg==')).toBe('')
    expect(embeddedImageSource('data:image/png,not-base64')).toBe('')
    expect(embeddedImageSource(`data:image/png;base64,${'a'.repeat(1_398_104)}`)).toBe('')
  })
})
