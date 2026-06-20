import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { lookup } from 'dns/promises'
import { isIP } from 'net'
import { app, net as electronNet } from 'electron'
import log from 'electron-log'

import { parseCachedImageReference, type ImageCacheType } from '../../resources/domain/imageCache'

import type { ServerResponse } from 'http'

interface CacheMetadata {
  key: string
  type: ImageCacheType
  target: string
  mimeType: string
  fileName: string
  createdAt: number
}

const ALLOWED_TYPES = new Set<ImageCacheType>(['icon', 'nft'])
const MAX_TARGET_LENGTH = 4096
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const FETCH_TIMEOUT = 8000
const MAX_REDIRECTS = 5

const MIME_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg'
}

const pending = new Map<string, Promise<CacheMetadata>>()

function cacheDir() {
  return path.join(app.getPath('userData'), 'ImageCache')
}

function keyFor(type: ImageCacheType, target: string) {
  return crypto.createHash('sha256').update(`${type}:${target}`).digest('hex')
}

function metadataPath(key: string) {
  return path.join(cacheDir(), `${key}.json`)
}

function filePath(metadata: CacheMetadata) {
  return path.join(cacheDir(), metadata.fileName)
}

async function pathExists(file: string) {
  try {
    await fs.promises.access(file)
    return true
  } catch {
    return false
  }
}

function normalizeMimeType(value: string | null) {
  return (value || '').split(';')[0].trim().toLowerCase()
}

function sniffMimeType(bytes: Buffer) {
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png'
  }

  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }

  if (
    bytes.length >= 12 &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp'
  }

  if (bytes.length >= 6) {
    const header = bytes.toString('ascii', 0, 6)
    if (header === 'GIF87a' || header === 'GIF89a') return 'image/gif'
  }

  const textHeader = bytes.subarray(0, 256).toString('utf8').trimStart().toLowerCase()
  if (textHeader.startsWith('<svg') || textHeader.startsWith('<?xml')) return 'image/svg+xml'

  return ''
}

function validateType(type: string | null): ImageCacheType {
  if (!type || !ALLOWED_TYPES.has(type as ImageCacheType)) throw new Error('Unsupported image cache type')
  return type as ImageCacheType
}

function hasControlCharacters(value: string) {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code <= 31 || code === 127) return true
  }

  return false
}

function validateTarget(target: string | null) {
  const cleanTarget = (target || '').trim()

  if (!cleanTarget) throw new Error('Missing image target')
  if (cleanTarget.length > MAX_TARGET_LENGTH) throw new Error('Image target is too long')
  if (hasControlCharacters(cleanTarget)) throw new Error('Invalid image target')

  return cleanTarget
}

function validateKey(key: string | null) {
  const cleanKey = (key || '').trim()
  if (!/^[a-f0-9]{64}$/.test(cleanKey)) throw new Error('Invalid image cache key')

  return cleanKey
}

function normalizeHostname(hostname: string) {
  return hostname.replace(/^\[|\]$/g, '').toLowerCase()
}

function isPrivateIPv4(address: string) {
  const parts = address.split('.').map((part) => Number(part))
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true
  }

  const [a, b] = parts

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  )
}

function isPrivateIPv6(address: string) {
  const normalized = address.toLowerCase()

  if (normalized === '::' || normalized === '::1') return true
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true
  if (/^fe[89ab]/.test(normalized)) return true

  const ipv4Mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (ipv4Mapped) return isPrivateIPv4(ipv4Mapped[1])

  return false
}

function isPublicIpAddress(address: string) {
  const family = isIP(address)
  if (family === 4) return !isPrivateIPv4(address)
  if (family === 6) return !isPrivateIPv6(address)
  return false
}

function parseRemoteImageUrl(target: string) {
  try {
    return new URL(target)
  } catch {
    throw new Error('Invalid image URL')
  }
}

async function validateRemoteImageUrl(target: string) {
  const targetUrl = parseRemoteImageUrl(target)

  if (targetUrl.protocol !== 'https:') throw new Error('Image URL must use HTTPS')
  if (targetUrl.username || targetUrl.password) throw new Error('Image URL cannot include credentials')
  if (targetUrl.port && targetUrl.port !== '443') throw new Error('Image URL uses an unsupported port')

  const hostname = normalizeHostname(targetUrl.hostname)
  if (!hostname) throw new Error('Image URL must include a hostname')
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new Error('Image URL cannot target local hostnames')
  }

  if (isIP(hostname)) {
    if (!isPublicIpAddress(hostname)) throw new Error('Image URL cannot target private addresses')
    return targetUrl.toString()
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true })
  if (addresses.length === 0) throw new Error('Image URL hostname could not be resolved')

  if (addresses.some(({ address }) => !isPublicIpAddress(address))) {
    throw new Error('Image URL cannot target private addresses')
  }

  return targetUrl.toString()
}

async function readMetadata(key: string, requireFile = true) {
  try {
    const raw = await fs.promises.readFile(metadataPath(key), 'utf8')
    const metadata = JSON.parse(raw) as CacheMetadata
    if (metadata.key !== key) return null
    if (requireFile && !(await pathExists(filePath(metadata)))) return null
    return metadata
  } catch {
    return null
  }
}

function isRedirect(status: number) {
  return [301, 302, 303, 307, 308].includes(status)
}

async function fetchRemoteImage(target: string, signal: AbortSignal) {
  let currentUrl = await validateRemoteImageUrl(target)

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    const response = await electronNet.fetch(currentUrl, { signal, redirect: 'manual' })

    if (!isRedirect(response.status)) return response

    const location = response.headers.get('location')
    if (!location) throw new Error('Image redirect is missing a location')

    const nextUrl = new URL(location, currentUrl).toString()
    currentUrl = await validateRemoteImageUrl(nextUrl)
  }

  throw new Error('Image has too many redirects')
}

async function fetchAndStore(type: ImageCacheType, target: string, key: string) {
  await fs.promises.mkdir(cacheDir(), { recursive: true })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

  try {
    const response = await fetchRemoteImage(target, controller.signal)

    if (!response.ok) throw new Error(`Image fetch failed with ${response.status}`)

    const contentLength = Number(response.headers.get('content-length') || 0)
    if (contentLength > MAX_IMAGE_BYTES) throw new Error('Image is too large')

    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.length > MAX_IMAGE_BYTES) throw new Error('Image is too large')

    const declaredMimeType = normalizeMimeType(response.headers.get('content-type'))
    const sniffedMimeType = sniffMimeType(buffer)
    const mimeType = MIME_EXTENSIONS[declaredMimeType] ? declaredMimeType : sniffedMimeType
    const extension = MIME_EXTENSIONS[mimeType]
    if (!extension)
      throw new Error(`Unsupported image type: ${declaredMimeType || sniffedMimeType || 'unknown'}`)

    const metadata: CacheMetadata = {
      key,
      type,
      target,
      mimeType,
      fileName: `${key}.${extension}`,
      createdAt: Date.now()
    }

    await fs.promises.writeFile(filePath(metadata), buffer, { mode: 0o600 })
    await fs.promises.writeFile(metadataPath(key), JSON.stringify(metadata), { mode: 0o600 })

    return metadata
  } finally {
    clearTimeout(timeout)
  }
}

async function getCachedImage(type: ImageCacheType, target: string) {
  const key = keyFor(type, target)
  const cached = await readMetadata(key)
  if (cached) return cached

  const existing = pending.get(key)
  if (existing) return existing

  const request = fetchAndStore(type, target, key).finally(() => {
    pending.delete(key)
  })

  pending.set(key, request)
  return request
}

async function getCachedImageByKey(type: ImageCacheType, key: string) {
  const validKey = validateKey(key)
  const metadata = await readMetadata(validKey)
  if (metadata) {
    if (metadata.type !== type) throw new Error('Cached image not found')
    return metadata
  }

  const staleMetadata = await readMetadata(validKey, false)
  if (!staleMetadata || staleMetadata.type !== type) throw new Error('Cached image not found')

  return getCachedImage(type, staleMetadata.target)
}

function sendError(res: ServerResponse, message: string, status = 400) {
  res.writeHead(status, { 'Content-Type': 'text/plain' })
  res.end(message)
}

function streamCachedImage(res: ServerResponse, metadata: CacheMetadata) {
  const stream = fs.createReadStream(filePath(metadata))

  stream.once('error', (err) => {
    log.error('Could not stream cached image', err)
    if (!res.headersSent) sendError(res, 'Cached image not found', 404)
    else res.end()
  })

  res.setHeader('Content-Type', metadata.mimeType)
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.writeHead(200)
  stream.pipe(res)
}

async function stream(res: ServerResponse, params: URLSearchParams) {
  try {
    const targetReference = parseCachedImageReference(params.get('target') || undefined)
    const type = validateType(params.get('type') || targetReference?.type || null)
    const key = params.get('key') || targetReference?.key

    if (key) {
      return streamCachedImage(res, await getCachedImageByKey(type, key))
    }

    const target = validateTarget(params.get('target'))
    return streamCachedImage(res, await getCachedImage(type, target))
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not load image'
    const status = message.startsWith('Unsupported image type')
      ? 415
      : message === 'Cached image not found'
        ? 404
        : 400
    log.warn('Image cache request failed', message)
    sendError(res, message, status)
  }
}

export default {
  stream,
  getCachedImage
}
