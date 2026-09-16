import { AddressIdentity, shortAddress } from '../../../../shared/renderer/ui/AddressIdentity'
import { TrayOverlay } from '../../../../shared/renderer/ui/TrayOverlay'
import { persistedImageSource } from '../../../asset-data/domain/image'
import TransactionInformation from '../../../requests/renderer/Account/Requests/TransactionRequest/TransactionInformation'
import type { ActivityCapability } from './activityCapability'
import { activityBalanceChanges, transactionStatusLabel } from './activityModel'
import type { ActivityDetailNetworkMetadata, ActivityNetworkMap, ActivityRecord } from './activityTypes'

const shortHash = (address: string | null | undefined = '') =>
  address ? `${address.substring(0, 5)}…${address.substring(address.length - 4)}` : ''

export function ActivityDetailsView({
  activity,
  fromAccountType,
  toAccountType,
  capability,
  network,
  networkMeta,
  onBack,
  originName
}: {
  activity: ActivityRecord
  fromAccountType?: string
  toAccountType?: string
  capability: Pick<ActivityCapability, 'copyText' | 'hydrateTokenImage'>
  network: ActivityNetworkMap[number]
  networkMeta: ActivityDetailNetworkMetadata
  onBack: () => void
  originName: string
}) {
  const chainId = Number(activity.chainId)
  const symbol = networkMeta.nativeCurrency?.symbol || network.symbol || 'ETH'
  const nativeCurrency = { ...networkMeta.nativeCurrency, symbol }
  const effects = activityBalanceChanges(activity, symbol)
  const receiptBlock = activity.receipt?.blockNumber ? parseInt(activity.receipt.blockNumber, 16) : undefined
  const copy = (value?: string | null) => {
    if (value) {
      void capability.copyText({ text: value })
    }
  }
  const from = activity.data?.from || activity.account || activity.address
  const to = activity.data?.to
  const details = [
    {
      label: 'From',
      actionLabel: `From: ${shortAddress(from || undefined)}`,
      value: from ? (
        <AddressIdentity address={from} accountType={fromAccountType} showCopy={false} />
      ) : undefined,
      onClick: () => copy(from)
    },
    {
      label: 'To',
      actionLabel: `To: ${activity.recipient || shortAddress(to)}`,
      value: to ? (
        <AddressIdentity
          address={to}
          accountType={toAccountType}
          nickname={activity.recipient}
          showCopy={false}
        />
      ) : (
        activity.recipient
      ),
      onClick: () => copy(to)
    },
    { label: 'Nonce', value: activity.nonce },
    { label: 'Hash', value: shortHash(activity.hash), onClick: () => copy(activity.hash) },
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
