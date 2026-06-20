export interface StoredWebAuthnCredential {
  version: 1
  credentialId: string
  salt: string
}

export interface WebAuthnEnrollment {
  credential: StoredWebAuthnCredential
  secret: string
}

const WEBAUTHN_TIMEOUT_MS = 60_000

const cancelKeywords = [
  'cancel',
  'canceled',
  'cancelled',
  'notallowederror',
  'not allowed',
  'aborterror',
  'aborted'
]

export const isBiometricUserCanceledError = (error: unknown) => {
  const name = String((error as any)?.name || '').toLowerCase()
  const message = String((error as any)?.message || '').toLowerCase()

  return cancelKeywords.some((keyword) => name.includes(keyword) || message.includes(keyword))
}

const randomBytes = (length: number) => {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return bytes
}

const toUint8Array = (value: ArrayBuffer | Uint8Array) =>
  value instanceof Uint8Array ? value : new Uint8Array(value)

const toHex = (value: ArrayBuffer | Uint8Array) =>
  Array.from(toUint8Array(value))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')

const fromHex = (value: string) => {
  const normalized = value.replace(/^0x/i, '')
  const bytes = new Uint8Array(normalized.length / 2)

  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(normalized.slice(i * 2, i * 2 + 2), 16)
  }

  return bytes
}

const getHmacSecretOutput = (results: any) => {
  const prfResult = results?.prf?.results?.first
  if (prfResult) return toUint8Array(prfResult)

  const hmacSecretResult = results?.hmacGetSecret?.output1
  if (hmacSecretResult) return toUint8Array(hmacSecretResult)

  return null
}

const getCredentialExtensionResults = (credential: PublicKeyCredential | null) =>
  credential && typeof (credential as any).getClientExtensionResults === 'function'
    ? (credential as any).getClientExtensionResults()
    : {}

const getSecretFromAssertion = async (storedCredential: StoredWebAuthnCredential) => {
  const credential = (await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      timeout: WEBAUTHN_TIMEOUT_MS,
      userVerification: 'required',
      allowCredentials: [
        {
          id: fromHex(storedCredential.credentialId),
          type: 'public-key'
        }
      ],
      extensions: {
        prf: {
          eval: {
            first: fromHex(storedCredential.salt)
          }
        },
        hmacGetSecret: {
          salt1: fromHex(storedCredential.salt)
        }
      }
    }
  } as CredentialRequestOptions)) as PublicKeyCredential | null

  if (!credential) throw new Error('Biometric unlock canceled')

  const extensionSecret = getHmacSecretOutput(getCredentialExtensionResults(credential))
  if (extensionSecret) return extensionSecret

  const response = credential.response
  if (response instanceof AuthenticatorAssertionResponse && response.userHandle) {
    return new Uint8Array(response.userHandle)
  }

  throw new Error('Biometric unlock did not return a usable secret')
}

export const isWebAuthnBiometricsSupported = async () => {
  if (
    typeof window === 'undefined' ||
    !window.isSecureContext ||
    typeof PublicKeyCredential === 'undefined' ||
    !navigator.credentials?.create ||
    !navigator.credentials?.get
  ) {
    return false
  }

  if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') {
    return true
  }

  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

export const createWebAuthnBiometricCredential = async (): Promise<WebAuthnEnrollment> => {
  if (!(await isWebAuthnBiometricsSupported())) {
    throw new Error('Passkey biometrics are not available on this device')
  }

  const userId = randomBytes(32)
  const salt = randomBytes(32)
  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge: randomBytes(32),
      rp: {
        name: 'Newframe'
      },
      user: {
        id: userId,
        name: 'Newframe',
        displayName: 'Newframe'
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 }
      ],
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'required'
      },
      timeout: WEBAUTHN_TIMEOUT_MS,
      attestation: 'none',
      extensions: {
        prf: {
          eval: {
            first: salt
          }
        },
        hmacCreateSecret: true
      }
    }
  } as CredentialCreationOptions)) as PublicKeyCredential | null

  if (!credential) throw new Error('Biometric unlock canceled')

  const storedCredential = {
    version: 1 as const,
    credentialId: toHex(credential.rawId),
    salt: toHex(salt)
  }

  let secret = getHmacSecretOutput(getCredentialExtensionResults(credential))

  if (!secret) {
    try {
      secret = await getSecretFromAssertion(storedCredential)
    } catch {
      secret = userId
    }
  }

  return {
    credential: storedCredential,
    secret: toHex(secret)
  }
}

export const getWebAuthnBiometricSecret = async (storedCredential: StoredWebAuthnCredential) =>
  toHex(await getSecretFromAssertion(storedCredential))
