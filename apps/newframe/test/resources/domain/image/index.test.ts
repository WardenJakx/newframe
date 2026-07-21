import { imageSource, isEmbeddedImage } from '../../../../resources/domain/image'

describe('image sources', () => {
  it('allows embedded and remote images', () => {
    expect(imageSource('data:image/png;base64,aWNvbg==')).toBe('data:image/png;base64,aWNvbg==')
    expect(imageSource('https://cdn.example/icon.png')).toBe('https://cdn.example/icon.png')
    expect(isEmbeddedImage(imageSource('data:image/png;base64,aWNvbg=='))).toBe(true)
  })

  it('rejects retired image-cache references', () => {
    expect(imageSource('frame-cache:icon:legacy')).toBe('')
  })
})
