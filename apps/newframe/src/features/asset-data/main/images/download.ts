import crypto from 'crypto'
import { lookup } from 'dns/promises'
import { isIP } from 'net'

import { outbound } from '../../../../platform/outbound/index.ts'
import type { TokenImage } from '../../../../platform/state-store/state/index.ts'
import {
  embeddedImageSource,
  isSupportedImageMimeType,
  MAX_EMBEDDED_IMAGE_BYTES
} from '../../domain/image/index.ts'

const MAX_TARGET_LENGTH = 4096
const MAX_IMAGE_BYTES = MAX_EMBEDDED_IMAGE_BYTES
const FETCH_TIMEOUT = 8000
const MAX_REDIRECTS = 5

const inFlightDownloads = new Map<string, Promise<TokenImage>>()

function normalizeMimeType(value: string | null) {
  return (value ?? '').split(';')[0].trim().toLowerCase()
}

function sniffMimeType(bytes: Buffer) {
  if (bytes.length >= 6 && bytes.readUInt32LE(0) === 0x00010000 && bytes.readUInt16LE(4) > 0) {
    return 'image/x-icon'
  }
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
    if (header === 'GIF87a' || header === 'GIF89a') {
      return 'image/gif'
    }
  }
  const textHeader = bytes.subarray(0, 256).toString('utf8').trimStart().toLowerCase()
  if (textHeader.startsWith('<svg') || textHeader.startsWith('<?xml')) {
    return 'image/svg+xml'
  }
  return ''
}

function hasControlCharacters(value: string) {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code <= 31 || code === 127) {
      return true
    }
  }
  return false
}

function normalizeHostname(hostname: string) {
  return hostname.replace(/^\[|\]$/g, '').toLowerCase()
}

function isPrivateIPv4(address: string) {
  const parts = address.split('.').map(Number)
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
  if (normalized === '::' || normalized === '::1') {
    return true
  }
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) {
    return true
  }
  if (/^fe[89ab]/.test(normalized)) {
    return true
  }
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  return mapped ? isPrivateIPv4(mapped[1]) : false
}

function isPublicIpAddress(address: string) {
  const family = isIP(address)
  if (family === 4) {
    return !isPrivateIPv4(address)
  }
  if (family === 6) {
    return !isPrivateIPv6(address)
  }
  return false
}

async function validateRemoteImageUrl(target: string) {
  const cleanTarget = target.trim()
  if (!cleanTarget || cleanTarget.length > MAX_TARGET_LENGTH || hasControlCharacters(cleanTarget)) {
    throw new Error('Invalid image URL')
  }

  let targetUrl: URL
  try {
    targetUrl = new URL(cleanTarget)
  } catch {
    throw new Error('Invalid image URL')
  }
  if (targetUrl.protocol !== 'https:') {
    throw new Error('Image URL must use HTTPS')
  }
  if (targetUrl.username || targetUrl.password) {
    throw new Error('Image URL cannot include credentials')
  }
  if (targetUrl.port && targetUrl.port !== '443') {
    throw new Error('Image URL uses an unsupported port')
  }

  const hostname = normalizeHostname(targetUrl.hostname)
  if (
    !hostname ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local')
  ) {
    throw new Error('Image URL cannot target local hostnames')
  }
  if (isIP(hostname)) {
    if (!isPublicIpAddress(hostname)) {
      throw new Error('Image URL cannot target private addresses')
    }
    return targetUrl.toString()
  }

  // Over Tor, names resolve at the exit, which cannot reach this computer's network; a local lookup would leak the name.
  if (outbound.route().via === 'tor') {
    return targetUrl.toString()
  }
  const addresses = await lookup(hostname, { all: true, order: 'verbatim' })
  if (!addresses.length || addresses.some(({ address }) => !isPublicIpAddress(address))) {
    throw new Error('Image URL hostname did not resolve to public addresses')
  }
  return targetUrl.toString()
}

function isRedirect(status: number) {
  return [301, 302, 303, 307, 308].includes(status)
}

function imageFromBytes(bytes: Buffer, declared: string, sourceUrl: string): TokenImage {
  if (bytes.length > MAX_IMAGE_BYTES) {
    throw new Error('Image is too large')
  }
  const sniffed = sniffMimeType(bytes)
  const mimeType = isSupportedImageMimeType(declared) && declared === sniffed ? declared : sniffed
  if (!isSupportedImageMimeType(mimeType)) {
    throw new Error('Unsupported image type')
  }

  return {
    base64: bytes.toString('base64'),
    contentHash: crypto.createHash('sha256').update(bytes).digest('hex'),
    mimeType,
    sourceUrl
  }
}

function decodeEmbeddedImage(target: string) {
  const sourceUrl = embeddedImageSource(target)
  if (!sourceUrl) {
    throw new Error('Invalid embedded image')
  }
  const separator = sourceUrl.indexOf(',')
  const declared = sourceUrl.slice(5, sourceUrl.indexOf(';')).toLowerCase()
  const encoded = sourceUrl.slice(separator + 1)
  const bytes = Buffer.from(encoded, 'base64')
  if (bytes.toString('base64').replace(/=+$/, '') !== encoded.replace(/=+$/, '')) {
    throw new Error('Invalid embedded image')
  }
  return imageFromBytes(bytes, declared, sourceUrl)
}

export async function fetchRemoteResource(target: string, signal: AbortSignal) {
  let currentUrl = await validateRemoteImageUrl(target)
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    const response = await outbound.request(currentUrl, { signal, redirect: 'manual' })
    if (!isRedirect(response.status)) {
      return response
    }
    const location = response.headers.get('location')
    if (!location) {
      throw new Error('Image redirect is missing a location')
    }
    currentUrl = await validateRemoteImageUrl(new URL(location, currentUrl).toString())
  }
  throw new Error('Image has too many redirects')
}

export async function readBoundedResponse(response: Response, maxBytes: number, errorMessage: string) {
  if (Number(response.headers.get('content-length') ?? 0) > maxBytes) {
    throw new Error(errorMessage)
  }
  if (!response.body) {
    throw new Error('Response has no body')
  }
  const reader = (response.body as ReadableStream<Uint8Array>).getReader()
  const chunks: Buffer[] = []
  let size = 0
  try {
    let result = await reader.read()
    while (!result.done) {
      const { value } = result
      size += value.byteLength
      if (size > maxBytes) {
        throw new Error(errorMessage)
      }
      chunks.push(Buffer.from(value))
      result = await reader.read()
    }
    return Buffer.concat(chunks, size)
  } catch (error) {
    void reader.cancel().catch(() => undefined)
    throw error
  } finally {
    reader.releaseLock()
  }
}

async function download(target: string): Promise<TokenImage> {
  if (target.trimStart().startsWith('data:')) {
    return decodeEmbeddedImage(target)
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT)
  try {
    const response = await fetchRemoteResource(target, controller.signal)
    if (!response.ok) {
      throw new Error(`Image fetch failed with ${response.status}`)
    }
    const bytes = await readBoundedResponse(response, MAX_IMAGE_BYTES, 'Image is too large')
    const declared = normalizeMimeType(response.headers.get('content-type'))
    return imageFromBytes(bytes, declared, target)
  } finally {
    clearTimeout(timeout)
  }
}

export async function downloadImage(target: string) {
  const existing = inFlightDownloads.get(target)
  if (existing) {
    return existing
  }
  const request = download(target).finally(() => inFlightDownloads.delete(target))
  inFlightDownloads.set(target, request)
  return request
}
