import { TrayOverlay } from '../../../../shared/renderer/ui/TrayOverlay'
import TransactionInformation from '../../../requests/renderer/Account/Requests/TransactionRequest/TransactionInformation'
import { getTransactionEffects } from '../../domain'
import { activityRequestLike, transactionStatusLabel } from './activityModel'
import { persistedImageSource } from '../../../asset-data/domain/image'
import type { ActivityCapability } from './activityCapability'
import type { ActivityDetailNetworkMetadata, ActivityNetworkMap, ActivityRecord } from './activityTypes'

const shortAddress = (address: string | null | undefined = '') =>
  address ? `${address.substring(0, 5)}…${address.substring(address.length - 4)}` : ''

export function ActivityDetailsView({
  activity,
  capability,
  network,
  networkMeta,
  onBack,
  originName
}: {
  activity: ActivityRecord
  capability: Pick<ActivityCapability, 'copyText' | 'hydrateTokenImage'>
  network: ActivityNetworkMap[number]
  networkMeta: ActivityDetailNetworkMetadata
  onBack: () => void
  originName: string
}) {
  const req = activityRequestLike(activity)
  const chainId = Number(activity.chainId)
  const symbol = networkMeta.nativeCurrency?.symbol || network.symbol || 'ETH'
  const nativeCurrency = { ...networkMeta.nativeCurrency, symbol }
  const effects = getTransactionEffects(req, symbol)
  const receiptBlock = activity.receipt?.blockNumber ? parseInt(activity.receipt.blockNumber, 16) : undefined
  const copy = (value?: string | null) => {
    if (value) void capability.copyText({ text: value })
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
        imageCapability={capability}
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
