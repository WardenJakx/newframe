import svg from '../../../resources/svg'

export function signerIcon(type: string, size = 16) {
  const signerType = (type || '').toLowerCase()

  if (signerType === 'address') return svg.eye(size)
  if (signerType === 'ledger') return svg.ledger(size)
  if (signerType === 'trezor') return svg.trezor(size)
  if (signerType === 'lattice') return svg.lattice(size)

  return svg.flame(size + 2)
}

export default function AccountIcon({ account }: { account?: { lastSignerType?: string } | null }) {
  return <div className='sendAccountIcon'>{signerIcon(account?.lastSignerType || '')}</div>
}
