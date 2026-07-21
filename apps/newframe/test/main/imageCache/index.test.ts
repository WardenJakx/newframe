import imageCache from '../../../main/imageCache'
import { electronMock } from '../../bun.mocks'

const mockFetch = jest.fn()
const mockLookup = jest.fn()
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])

jest.mock('dns/promises', () => ({
  lookup: (...args: any[]) => mockLookup(...args)
}))

function createResponse(body: Buffer, contentType: string, ok = true) {
  return {
    ok,
    status: ok ? 200 : 404,
    headers: {
      get: (name: string) => {
        if (name.toLowerCase() === 'content-type') return contentType
        if (name.toLowerCase() === 'content-length') return String(body.length)
        return null
      }
    },
    arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength)
  }
}

function createRedirect(location: string, status = 302) {
  return {
    ok: false,
    status,
    headers: { get: (name: string) => (name.toLowerCase() === 'location' ? location : null) },
    arrayBuffer: async () => new ArrayBuffer(0)
  }
}

beforeEach(() => {
  mockFetch.mockReset()
  electronMock.net.fetch.mockImplementation((...args: any[]) => mockFetch(...args))
  mockLookup.mockReset()
  mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
})

it('downloads and returns a persistable base64 image payload', async () => {
  mockFetch.mockResolvedValue(createResponse(png, 'image/png'))

  const image = await imageCache.downloadImage('https://cdn.example/usdc.png')

  expect(image).toEqual({
    base64: png.toString('base64'),
    contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    mimeType: 'image/png',
    sourceUrl: 'https://cdn.example/usdc.png'
  })
})

it('deduplicates concurrent downloads for the same URL', async () => {
  mockFetch.mockResolvedValue(createResponse(png, 'image/png'))
  const target = 'https://cdn.example/shared.png'

  await Promise.all([imageCache.downloadImage(target), imageCache.downloadImage(target)])

  expect(mockFetch).toHaveBeenCalledTimes(1)
})

it('rejects non-HTTPS and local image URLs', async () => {
  await expect(imageCache.downloadImage('ipfs://bafybeihash/icon.png')).rejects.toThrow(
    'Image URL must use HTTPS'
  )
  await expect(imageCache.downloadImage('https://localhost/usdc.png')).rejects.toThrow(
    'Image URL cannot target local hostnames'
  )
  expect(mockFetch).not.toHaveBeenCalled()
})

it('rejects unsupported image MIME types', async () => {
  mockFetch.mockResolvedValue(createResponse(Buffer.from('<html></html>'), 'text/html'))

  await expect(imageCache.downloadImage('https://cdn.example/not-an-image')).rejects.toThrow(
    'Unsupported image type'
  )
})

it('rejects redirects to private image URLs', async () => {
  mockFetch.mockResolvedValue(createRedirect('https://127.0.0.1/usdc.png'))

  await expect(imageCache.downloadImage('https://cdn.example/usdc.png')).rejects.toThrow(
    'Image URL cannot target private addresses'
  )
  expect(mockFetch).toHaveBeenCalledTimes(1)
})
