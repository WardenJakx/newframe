import type { IconName } from '@newframe/ui/icon'

const LABELS: Record<string, string> = {
  ring: 'Hot Signer',
  seed: 'Hot Signer',
  address: 'Watch-only',
  ledger: 'Ledger',
  trezor: 'Trezor',
  lattice: 'Lattice'
}

export const signerIconName = (type = ''): IconName =>
  (({ address: 'eye', ledger: 'ledger', trezor: 'trezor', lattice: 'lattice' })[
    type.toLowerCase()
  ] as IconName) || 'flame'

export const signerTypeLabel = (type = '', fallback = 'Account') =>
  LABELS[type.toLowerCase()] || type || fallback

export const signerIsReady = (status = '') => status.toLowerCase() === 'ok'

export const signerIsLoading = (status = '') =>
  ['loading', 'connecting', 'addresses', 'input', 'pairing', 'deriving'].some((part) =>
    status.toLowerCase().includes(part)
  )

export function signerStatusText({ status = '', type = '' }: { status?: string; type?: string }) {
  const normalized = status.toLowerCase()
  if (signerIsReady(normalized)) return 'Connected and ready to sign'
  if (normalized === 'locked') return `Unlock your ${type}`
  if (normalized === 'pair') return 'Pair your Lattice'
  if (normalized === 'need pin') return 'Enter the PIN positions shown on your Trezor'
  if (normalized === 'enter passphrase') return 'Enter your Trezor passphrase'
  return status || `Connect your ${type}`
}
