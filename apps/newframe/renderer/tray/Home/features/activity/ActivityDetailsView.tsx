import link from '../../../../shared/link'
import { TrayOverlay } from '../../../../shared/ui/TrayOverlay'
import TransactionInformation from '../../../Account/Requests/TransactionRequest/TransactionInformation'
import { getTransactionEffects } from '../../../../../domain/transaction'
import { activityRequestLike, transactionStatusLabel } from './activityModel'
import { persistedImageSource } from '../../../../../domain/image'

const shortAddress = (address = '') =>
  address ? `${address.substring(0, 5)}…${address.substring(address.length - 4)}` : ''

export function ActivityDetailsView({
  activity,
  network,
  networkMeta,
  onBack,
  originName
}: {
  activity: any
  network: any
  networkMeta: any
  onBack: () => void
  originName: string
}) {
  const req = activityRequestLike(activity)
  const chainId = Number(activity.chainId)
  const nativeCurrency = networkMeta.nativeCurrency || { symbol: network.symbol || 'ETH' }
  const symbol = nativeCurrency.symbol || network.symbol || 'ETH'
  const effects = getTransactionEffects(req, symbol)
  const receiptBlock = activity.receipt?.blockNumber ? parseInt(activity.receipt.blockNumber, 16) : undefined
  const copy = (value?: string) => {
    if (value) void link.executeCommand({ type: 'clipboard.write', text: value })
  }
  const from = activity.data?.from || activity.account || activity.address
  const to = activity.data?.to
  const details = [
    { label: 'From', value: shortAddress(from), onClick: () => copy(from) },
    { label: 'To', value: activity.recipient || shortAddress(to), onClick: () => copy(to) },
    { label: 'Nonce', value: activity.nonce },
    { label: 'Hash', value: shortAddress(activity.hash), onClick: () => copy(activity.hash) },
    { label: 'Method', value: activity.decodedData?.method },
    { label: 'Block', value: receiptBlock ? String(receiptBlock) : undefined }
  ]

  return (
    <TrayOverlay
      closeLabel='Back to activity'
      label='Transaction activity details'
      onClose={onBack}
      padding='none'
      title='Activity'
    >
      <TransactionInformation
        originName={originName}
        details={details}
        effects={effects}
        effectsEmptyText='No direct asset changes detected'
        nativeCurrency={nativeCurrency}
        networkName={network.name || `Chain ${chainId}`}
        networkIcon={persistedImageSource(networkMeta.image)}
        notice={activity.status === 'reverted' ? 'Transaction reverted on-chain' : undefined}
        statusLabel={transactionStatusLabel(activity.status)}
      />
    </TrayOverlay>
  )
}
