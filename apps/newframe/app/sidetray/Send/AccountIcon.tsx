import { Icon, type IconName } from '@newframe/ui/icon'
import { Panel } from '@newframe/ui/side-panel'

export function signerIcon(type: string): IconName {
  const signerType = (type || '').toLowerCase()

  if (signerType === 'address') return 'eye'
  if (signerType === 'ledger') return 'ledger'
  if (signerType === 'trezor') return 'trezor'
  if (signerType === 'lattice') return 'lattice'

  return 'flame'
}

export default function AccountIcon({ account }: { account?: { lastSignerType?: string } | null }) {
  return (
    <Panel variants='sendAccountIcon'>
      <Icon name={signerIcon(account?.lastSignerType || '')} size='medium' />
    </Panel>
  )
}
