import crypto from 'crypto'
import { lookup } from 'dns/promises'
import { isIP } from 'net'
import { net as electronNet } from 'electron'

import type { TokenImage } from '../store/state'

const MAX_TARGET_LENGTH = 4096
const MAX_IMAGE_BYTES = 1024 * 1024
const FETCH_TIMEOUT = 8000
const MAX_REDIRECTS = 5

const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'])

const inFlightDownloads = new Map<string, Promise<TokenImage>>()

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

function hasControlCharacters(value: string) {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code <= 31 || code === 127) return true
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
  if (normalized === '::' || normalized === '::1') return true
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true
  if (/^fe[89ab]/.test(normalized)) return true
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  return mapped ? isPrivateIPv4(mapped[1]) : false
}

function isPublicIpAddress(address: string) {
  const family = isIP(address)
  if (family === 4) return !isPrivateIPv4(address)
  if (family === 6) return !isPrivateIPv6(address)
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
  if (targetUrl.protocol !== 'https:') throw new Error('Image URL must use HTTPS')
  if (targetUrl.username || targetUrl.password) throw new Error('Image URL cannot include credentials')
  if (targetUrl.port && targetUrl.port !== '443') throw new Error('Image URL uses an unsupported port')

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
    if (!isPublicIpAddress(hostname)) throw new Error('Image URL cannot target private addresses')
    return targetUrl.toString()
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true })
  if (!addresses.length || addresses.some(({ address }) => !isPublicIpAddress(address))) {
    throw new Error('Image URL hostname did not resolve to public addresses')
  }
  return targetUrl.toString()
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
    currentUrl = await validateRemoteImageUrl(new URL(location, currentUrl).toString())
  }
  throw new Error('Image has too many redirects')
}

async function download(target: string): Promise<TokenImage> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT)
  try {
    const response = await fetchRemoteImage(target, controller.signal)
    if (!response.ok) throw new Error(`Image fetch failed with ${response.status}`)
    const contentLength = Number(response.headers.get('content-length') || 0)
    if (contentLength > MAX_IMAGE_BYTES) throw new Error('Image is too large')
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.length > MAX_IMAGE_BYTES) throw new Error('Image is too large')
    const declared = normalizeMimeType(response.headers.get('content-type'))
    const sniffed = sniffMimeType(bytes)
    const mimeType = ALLOWED_MIME_TYPES.has(declared) && declared === sniffed ? declared : sniffed
    if (!ALLOWED_MIME_TYPES.has(mimeType)) throw new Error('Unsupported image type')

    return {
      base64: bytes.toString('base64'),
      contentHash: crypto.createHash('sha256').update(bytes).digest('hex'),
      mimeType,
      sourceUrl: target
    }
  } finally {
    clearTimeout(timeout)
  }
}

export async function downloadImage(target: string) {
  const existing = inFlightDownloads.get(target)
  if (existing) return existing
  const request = download(target).finally(() => inFlightDownloads.delete(target))
  inFlightDownloads.set(target, request)
  return request
}
