import fs from 'fs'
import os from 'os'
import path from 'path'
import { PassThrough } from 'stream'

import imageCache from '../../../main/imageCache'
import { cachedImageReference } from '../../../resources/domain/imageCache'
import { electronMock } from '../../bun.mocks'

const mockFetch = jest.fn()
const mockLookup = jest.fn()
let mockUserDataDir = ''

jest.mock('dns/promises', () => ({
  lookup: (...args: any[]) => mockLookup(...args)
}))

jest.mock('electron-log', () => ({
  error: jest.fn(),
  warn: jest.fn()
}))

function createResponse(body: string | Buffer, contentType: string, ok = true) {
  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body)

  return {
    ok,
    status: ok ? 200 : 404,
    headers: {
      get: (name: string) => {
        if (name.toLowerCase() === 'content-type') return contentType
        if (name.toLowerCase() === 'content-length') return String(bytes.length)
        return null
      }
    },
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  }
}

function createRedirect(location: string, status = 302) {
  return {
    ok: false,
    status,
    headers: {
      get: (name: string) => {
        if (name.toLowerCase() === 'location') return location
        return null
      }
    },
    arrayBuffer: async () => new ArrayBuffer(0)
  }
}

function createMockServerResponse() {
  const res = new PassThrough()
  ;(res as any).setHeader = jest.fn()
  ;(res as any).writeHead = jest.fn()
  ;(res as any).getResponseData = async () =>
    new Promise<string>((resolve) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    })

  return res
}

async function streamImage(target: string, type = 'icon') {
  const res = createMockServerResponse()
  const params = new URLSearchParams({ type, target })
  const data = (res as any).getResponseData()

  await imageCache.stream(res as any, params)

  return {
    res,
    data: await data
  }
}

beforeEach(() => {
  mockUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frame-image-cache-'))
  mockFetch.mockReset()
  electronMock.app.getPath.mockImplementation(() => mockUserDataDir)
  electronMock.net.fetch.mockImplementation((...args: any[]) => mockFetch(...args))
  mockLookup.mockReset()
  mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
})

afterEach(() => {
  fs.rmSync(mockUserDataDir, { recursive: true, force: true })
})

it('downloads an image through the central cache endpoint and stores it on disk', async () => {
  mockFetch.mockResolvedValue(createResponse('cached image', 'image/png'))

  const target = 'https://cdn.example/usdc.png'
  const { res, data } = await streamImage(target)

  expect(data).toBe('cached image')
  expect((res as any).writeHead).toHaveBeenCalledWith(200)
  expect((res as any).setHeader).toHaveBeenCalledWith('Content-Type', 'image/png')
  expect(mockFetch).toHaveBeenCalledWith('https://cdn.example/usdc.png', expect.any(Object))

  const cacheFiles = fs.readdirSync(path.join(mockUserDataDir, 'ImageCache'))
  expect(cacheFiles.some((file) => file.endsWith('.png'))).toBe(true)
  expect(cacheFiles.some((file) => file.endsWith('.json'))).toBe(true)
})

it('streams a cached image without downloading it again', async () => {
  mockFetch.mockResolvedValue(createResponse('cached image', 'image/png'))

  const target = 'https://cdn.example/usdc.png'
  await streamImage(target)
  const { data } = await streamImage(target)

  expect(data).toBe('cached image')
  expect(mockFetch).toHaveBeenCalledTimes(1)
})

it('streams a cached image reference without downloading it again', async () => {
  mockFetch.mockResolvedValue(createResponse('cached image', 'image/png'))

  const target = 'https://cdn.example/chain.png'
  const metadata = await imageCache.getCachedImage('icon', target)
  const reference = cachedImageReference('icon', metadata.key)
  mockFetch.mockClear()

  const { data } = await streamImage(reference)

  expect(data).toBe('cached image')
  expect(mockFetch).not.toHaveBeenCalled()
})

it('re-downloads a cached image reference when its local file is missing', async () => {
  mockFetch.mockResolvedValue(createResponse('cached image', 'image/png'))

  const target = 'https://cdn.example/chain.png'
  const metadata = await imageCache.getCachedImage('icon', target)
  const reference = cachedImageReference('icon', metadata.key)
  fs.rmSync(path.join(mockUserDataDir, 'ImageCache', metadata.fileName))
  mockFetch.mockResolvedValue(createResponse('re-downloaded image', 'image/png'))
  mockFetch.mockClear()

  const { data } = await streamImage(reference)

  expect(data).toBe('re-downloaded image')
  expect(mockFetch).toHaveBeenCalledWith(target, expect.any(Object))
})

it('rejects IPFS image URLs instead of using an external gateway', async () => {
  const { data } = await streamImage('ipfs://bafybeihash/icon.png')

  expect(data).toBe('Image URL must use HTTPS')
  expect(mockFetch).not.toHaveBeenCalled()
})

it('rejects unsupported image MIME types', async () => {
  mockFetch.mockResolvedValue(createResponse('<html></html>', 'text/html'))

  const target = 'https://cdn.example/not-an-image'
  const { res, data } = await streamImage(target)

  expect(data).toBe('Unsupported image type: text/html')
  expect((res as any).writeHead).toHaveBeenCalledWith(415, { 'Content-Type': 'text/plain' })
})

it('rejects local image URLs before fetching', async () => {
  const target = 'https://localhost/usdc.png'
  const { res, data } = await streamImage(target)

  expect(data).toBe('Image URL cannot target local hostnames')
  expect((res as any).writeHead).toHaveBeenCalledWith(400, { 'Content-Type': 'text/plain' })
  expect(mockFetch).not.toHaveBeenCalled()
})

it('rejects redirects to private image URLs', async () => {
  mockFetch.mockResolvedValue(createRedirect('https://127.0.0.1/usdc.png'))

  const target = 'https://cdn.example/usdc.png'
  const { res, data } = await streamImage(target)

  expect(data).toBe('Image URL cannot target private addresses')
  expect((res as any).writeHead).toHaveBeenCalledWith(400, { 'Content-Type': 'text/plain' })
  expect(mockFetch).toHaveBeenCalledTimes(1)
})
