import fs from 'fs'
import { PassThrough, Readable } from 'stream'
import assetModule from '../../../../../main/dapps/server/asset'

// real module under test, exercised with mock responses
const asset = assetModule as any

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  createReadStream: jest.fn()
}))

jest.mock('../../../../../main/dapps/verify', () => ({
  getDappCacheDir: () => '/home/user/.config/DappCache'
}))

const createMockResponse = () => {
  const res = new PassThrough()
  ;(res as any).setHeader = jest.fn()
  ;(res as any).writeHead = jest.fn()
  ;(res as any).getResponseData = async () =>
    new Promise((resolve) => {
      const chunks: any = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    })

  return res
}

beforeEach(() => {
  ;(fs.existsSync as any).mockReturnValue(true)
  ;(fs.createReadStream as any).mockReturnValue(Readable.from('hello, Frame!'))
})

it('returns a stream with the asset contents', async () => {
  const res = createMockResponse()

  asset.stream(res, '0xhash', '/some/asset.js')

  expect((res as any).writeHead).toHaveBeenCalledWith(200)
  expect((res as any).setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*')
  expect((res as any).setHeader).toHaveBeenCalledWith(
    'Access-Control-Allow-Headers',
    expect.stringMatching(/X-Requested-With/)
  )
  expect((res as any).setHeader).toHaveBeenCalledWith(
    'Access-Control-Allow-Headers',
    expect.stringMatching(/content-type/)
  )

  return expect((res as any).getResponseData()).resolves.toBe('hello, Frame!')
})

it('streams a dapp from its root path', () => {
  asset.stream(createMockResponse(), '0xhash', '/')

  expect(fs.existsSync).toHaveBeenCalledWith(
    (expect as any).toMatchPath('/home/user/.config/DappCache/0xhash/index.html')
  )
  expect(fs.createReadStream).toHaveBeenCalledWith(
    (expect as any).toMatchPath('/home/user/.config/DappCache/0xhash/index.html')
  )
})

it('streams a dapp with the correct content type', () => {
  const res = createMockResponse()

  asset.stream(res, '0xhash', '/')

  expect((res as any).setHeader).toHaveBeenCalledWith('content-type', 'text/html')
})

it('streams an asset from disk', () => {
  asset.stream(createMockResponse(), '0xhash', '/some/asset.js')

  expect(fs.existsSync).toHaveBeenCalledWith(
    (expect as any).toMatchPath('/home/user/.config/DappCache/0xhash/some/asset.js')
  )
  expect(fs.createReadStream).toHaveBeenCalledWith(
    (expect as any).toMatchPath('/home/user/.config/DappCache/0xhash/some/asset.js')
  )
})

it('streams an asset with the correct content type', () => {
  const res = createMockResponse()

  asset.stream(res, '0xhash', '/some/asset.js')

  expect((res as any).setHeader).toHaveBeenCalledWith('content-type', 'application/javascript')
})

it('returns a 404 when a dapp is not found', () => {
  ;(fs.existsSync as any).mockReturnValue(false)

  const res = createMockResponse()
  res.end = jest.fn()

  asset.stream(res, '0xhash', '/')

  expect((res as any).writeHead).toHaveBeenCalledWith(404)
  expect(res.end).toHaveBeenCalledWith('Dapp not found')
})

it('returns a 404 when an asset does not exist', () => {
  ;(fs.existsSync as any).mockReturnValue(false)

  const res = createMockResponse()
  res.end = jest.fn()

  asset.stream(res, '0xhash', '/some/asset.js')

  expect((res as any).writeHead).toHaveBeenCalledWith(404)
  expect(res.end).toHaveBeenCalledWith('Asset not found')
})

it('returns a 404 when the asset stream encounters an error', () => {
  const s = Readable.from('test')
  ;(fs.createReadStream as any).mockReturnValue(s)

  const res = createMockResponse()
  res.end = jest.fn()

  asset.stream(res, '0xhash', '/some/asset.js')

  s.emit('error', new Error('invalid file'))

  expect((res as any).writeHead).toHaveBeenCalledWith(404)
  expect(res.end).toHaveBeenCalledWith('invalid file')
})

it('returns a 404 when there is an error returning the asset', () => {
  // invalid stream
  ;(fs.createReadStream as any).mockReturnValue('')

  const res = createMockResponse()
  res.end = jest.fn()

  asset.stream(res, '0xhash', '/some/asset.js')

  expect((res as any).writeHead).toHaveBeenCalledWith(404)
  expect(res.end).toHaveBeenCalledWith(expect.any(String))
})
