type SignerSummary = {
  status: string
  type: string
}

// in order of increasing priority
export const Type = {
  Ring: 'ring',
  Seed: 'seed',
  Trezor: 'trezor',
  Ledger: 'ledger',
  Lattice: 'lattice'
} as const

export type Type = (typeof Type)[keyof typeof Type]

export function getSignerType(typeValue: string) {
  return Object.values(Type).find((type) => type === typeValue)
}

export function getSignerDisplayType(typeOrSigner: string | SignerSummary = '') {
  const signerType = typeof typeOrSigner === 'string' ? typeOrSigner : typeOrSigner.type
  return ['ring', 'seed'].includes(signerType.toLowerCase()) ? 'hot' : signerType
}

export function isHardwareSigner(typeOrSigner: string | SignerSummary = '') {
  const signerType = typeof typeOrSigner === 'string' ? typeOrSigner : typeOrSigner.type

  return ['ledger', 'trezor', 'lattice'].includes(signerType.toLowerCase())
}

export function isSignerReady(signer: SignerSummary) {
  return signer.status === 'ok'
}

export function findUnavailableSigners<TSigner extends SignerSummary>(
  signerTypeValue: string,
  signers: TSigner[]
): TSigner[] {
  if (!isHardwareSigner(signerTypeValue)) return []

  return signers.filter((signer) => signer.type === signerTypeValue && !isSignerReady(signer))
}
