import { AddressIdentity, shortAddress } from '../../../../shared/renderer/ui/AddressIdentity.tsx'
import { TrayOverlay } from '../../../../shared/renderer/ui/TrayOverlay.tsx'
import { persistedImageSource } from '../../../asset-data/domain/image/index.ts'
import TransactionInformation from '../../../requests/renderer/Account/Requests/TransactionRequest/TransactionInformation.tsx'
import type { ActivityCapability } from './activityCapability.ts'
import { activityBalanceChanges, transactionStatusLabel } from './activityModel.ts'
import type { ActivityDetailChainMetadata, ActivityChainMap, ActivityRecord } from './activityTypes.ts'

const shortHash = (address: string | null | undefined = '') =>
  address ? `${address.substring(0, 5)}…${address.substring(address.length - 4)}` : ''

export function ActivityDetailsView({
  activity,
  capability,
  chain,
  chainMeta,
  onBack,
  originName
}: {
  activity: ActivityRecord
  capability: Pick<ActivityCapability, 'copyText' | 'hydrateTokenImage'>
  chain: ActivityChainMap[number]
  chainMeta: ActivityDetailChainMetadata
  onBack: () => void
  originName: string
}) {
  const chainId = Number(activity.chainId)
  const symbol = [chainMeta.nativeCurrency.symbol, chain.symbol].find(Boolean) ?? 'ETH'
  const nativeCurrency = { ...chainMeta.nativeCurrency, symbol }
  const effects = activityBalanceChanges(activity, symbol)
  const receiptBlock = activity.receipt?.blockNumber ? parseInt(activity.receipt.blockNumber, 16) : undefined
  const copy = (value?: string | null) => {
    if (value) {
      void capability.copyText({ text: value })
    }
  }
  const from = activity.data?.from ?? activity.account ?? activity.address
  const to = activity.data?.to
  const details = [
    {
      label: 'From',
      actionLabel: `From: ${shortAddress(from ?? undefined)}`,
      value: from ? <AddressIdentity address={from} showCopy={false} /> : undefined,
      onClick: () => copy(from)
    },
    {
      label: 'To',
      actionLabel: `To: ${activity.recipient ?? shortAddress(to)}`,
      value: to ? (
        <AddressIdentity address={to} name={activity.recipient} showCopy={false} />
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
        sections={[{ details }]}
        effects={effects}
        effectsEmptyText='No direct asset changes detected'
        nativeCurrency={nativeCurrency}
        chainName={chain.name ?? `Chain ${chainId}`}
        chainIcon={persistedImageSource(chainMeta.image)}
        notice={activity.status === 'reverted' ? 'Transaction reverted on-chain' : undefined}
        statusLabel={transactionStatusLabel(activity.status)}
      />
    </TrayOverlay>
  )
}
