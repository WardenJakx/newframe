import { ParsedMessage } from '@spruceid/siwe-parser'
import { getAddress } from 'ethers'

export type SiweInspection =
  | { kind: 'message' }
  | { kind: 'invalid'; warning: string }
  | { kind: 'siwe'; parsed: ParsedMessage; blockedReason?: string; warnings: string[] }

type SiweInspectionOptions = {
  signingAddress?: string
  isContractAccount?: boolean
}

const signInText = 'wants you to sign in with your Ethereum account'

// URL accepts and normalizes several strings that are not origins, including
// backslashes, credentials, and leading whitespace. Reject those first.
function parseOrigin(value: string) {
  // oxlint-disable-next-line no-control-regex -- URL strips controls instead of rejecting them.
  if (/[\u0000-\u0020\u007f\\@]/.test(value) || !/^[a-z][a-z\d+.-]*:\/\/[^/?#]+\/?$/i.test(value)) {
    return undefined
  }

  try {
    const origin = new URL(value)
    return origin.hostname && origin.origin !== 'null' ? origin : undefined
  } catch {
    return undefined
  }
}

function isLoopback(hostname: string) {
  return hostname === 'localhost' || hostname === '[::1]' || /^127\.\d+\.\d+\.\d+$/.test(hostname)
}

function verifyOrigin(parsed: ParsedMessage, requestOrigin?: string) {
  const origin = requestOrigin ? parseOrigin(requestOrigin) : undefined
  if (!origin) {
    return {
      blockedReason: "The requesting site's origin could not be verified. Signing is blocked.",
      warnings: []
    }
  }

  // EIP-4361 recommends HTTPS when the message omits its scheme. HTTP is only
  // enabled for a matching loopback origin, the EIP's local developer mode.
  const scheme = (parsed.scheme ?? 'https').toLowerCase()
  const localHttp = scheme === 'http' && isLoopback(origin.hostname)
  if (scheme !== 'https' && !localHttp) {
    return {
      blockedReason: 'This sign-in request uses an unsupported scheme. Signing is blocked.',
      warnings: []
    }
  }

  const signInOrigin = parseOrigin(`${scheme}://${parsed.domain}`)
  if (!signInOrigin) {
    return { blockedReason: 'The sign-in domain is not a valid origin. Signing is blocked.', warnings: [] }
  }
  if (signInOrigin.protocol !== origin.protocol) {
    return {
      blockedReason: 'The sign-in scheme does not match the requesting site. Signing is blocked.',
      warnings: []
    }
  }
  if (signInOrigin.hostname !== origin.hostname) {
    return {
      blockedReason: 'The sign-in domain does not match the requesting site. Signing is blocked.',
      warnings: []
    }
  }
  if (signInOrigin.port !== origin.port) {
    return {
      blockedReason: 'The sign-in port does not match the requesting site. Signing is blocked.',
      warnings: []
    }
  }

  return { warnings: localHttp ? ['This local development sign-in uses HTTP instead of HTTPS.'] : [] }
}

function parseMessage(message: string, isContractAccount: boolean) {
  try {
    return new ParsedMessage(message)
  } catch (error) {
    const addressStart = message.indexOf('\n') + 1
    const addressEnd = message.indexOf('\n', addressStart)
    const address = message.slice(addressStart, addressEnd)
    if (!isContractAccount || addressStart === 0 || !/^0x[\da-f]{40}$/i.test(address)) {
      throw error
    }

    // The parser requires EIP-55 for every address. EIP-4361 only requires it
    // where applicable to EOAs. Check a known contract's syntax with a temporary
    // checksummed address, then restore the exact address for display. Signing
    // always uses the original message, never this parser-only copy.
    const checksummed = getAddress(address.toLowerCase())
    const parsed = new ParsedMessage(
      `${message.slice(0, addressStart)}${checksummed}${message.slice(addressEnd)}`
    )
    parsed.address = address
    return parsed
  }
}

export function inspectSiweMessage(
  message: string,
  requestOrigin?: string,
  options: SiweInspectionOptions = {}
): SiweInspection {
  if (!message.includes(signInText)) {
    return { kind: 'message' }
  }

  let parsed: ParsedMessage
  try {
    // Parse the complete original message. Never reconstruct the signing bytes
    // from these display fields or trim text before checking the ABNF.
    parsed = parseMessage(message, options.isContractAccount === true)
  } catch {
    return {
      kind: 'invalid',
      warning: 'This message resembles a sign-in request but has an invalid format. Review the full message.'
    }
  }

  const originReview = verifyOrigin(parsed, requestOrigin)
  if (
    !originReview.blockedReason &&
    options.signingAddress !== undefined &&
    options.signingAddress.toLowerCase() !== parsed.address.toLowerCase()
  ) {
    return {
      kind: 'siwe',
      parsed,
      ...originReview,
      blockedReason:
        'The address in this sign-in message does not match the signing account. Signing is blocked.'
    }
  }

  return { kind: 'siwe', parsed, ...originReview }
}
