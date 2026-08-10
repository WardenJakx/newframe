import { getPaidTransactionFee, getTransactionEffects } from '../../domain'
import { timestamp } from '../../../../shared/domain/timestamp'
import { formatUnits, toBigInt } from '../../../../shared/domain/units'
import {
  projectActivityRecord,
  type ActivityNetworkMap,
  type ActivityBalanceChange,
  type ActivityRecord,
  type ActivityViewRecord,
  type WalletActivityRecord
} from './activityTypes'

export function transactionStatusLabel(status?: string) {
  if (status === 'submitted') return 'Submitted'
  if (status === 'confirming') return 'Confirming'
  if (status === 'succeeded') return 'Confirmed'
  if (status === 'reverted') return 'Reverted'
  return 'Submitted'
}

function requestStatusFromActivity(status?: string) {
  if (status === 'submitted') return 'verifying'
  if (status === 'confirming') return 'confirming'
  if (status === 'succeeded') return 'confirmed'
  if (status === 'reverted') return 'error'
  return 'verifying'
}

export function activityGlyphState(status?: string) {
  if (status === 'succeeded') return 'completed'
  if (status === 'reverted') return 'failed'
  return 'pending'
}

export function activityRequestLike(activity: ActivityRecord) {
  return {
    ...activity,
    type: 'transaction',
    data: activity.data || {},
    recognizedActions: activity.recognizedActions || [],
    status: requestStatusFromActivity(activity.status),
    notice: transactionStatusLabel(activity.status),
    tx: {
      hash: activity.hash,
      confirmations: activity.confirmations || 0,
      receipt: activity.receipt
    }
  }
}

export function activityTimestampLabel(activity: ActivityRecord) {
  const submittedAt = timestamp(activity.submittedAt, timestamp(activity.updatedAt, 0))
  if (!submittedAt) return ''

  return new Date(submittedAt).toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

function activityBalanceChanges(activity: ActivityRecord, nativeSymbol = 'ETH'): ActivityBalanceChange[] {
  if (Array.isArray(activity.balanceChanges)) return activity.balanceChanges

  return getTransactionEffects(activityRequestLike(activity), nativeSymbol).filter(
    (effect) => effect.direction === 'in' || effect.direction === 'out'
  )
}

function activityGasSpent(activity: ActivityRecord) {
  return activity.gasSpent || getPaidTransactionFee(activityRequestLike(activity))
}

export function activityBalanceChangeLabel(
  activity: ActivityRecord,
  nativeSymbol = 'ETH',
  tokenForAddress?: (address: string) => { decimals?: number; symbol?: string } | undefined
) {
  const changes = activityBalanceChanges(activity, nativeSymbol)
  if (!changes.length) return ''

  const labels = changes.slice(0, 2).map((change) => {
    const sign = change.direction === 'in' ? '+' : '−'
    const token = change.assetAddress ? tokenForAddress?.(change.assetAddress) : undefined
    const decimals = Number.isInteger(token?.decimals) ? token?.decimals : change.decimals
    const amount = Number.isInteger(decimals) ? formatUnits(toBigInt(change.amount) ?? 0n, decimals) : '?'
    return `${sign}${amount} ${token?.symbol || change.symbol || '?'}`
  })
  const remaining = changes.length - labels.length

  return `${labels.join(' · ')}${remaining > 0 ? ` · +${remaining} more` : ''}`
}

export function activityGasLabel(activity: ActivityRecord, nativeSymbol = 'ETH') {
  const gasSpent = activityGasSpent(activity)
  return gasSpent ? `Gas ${formatUnits(toBigInt(gasSpent) ?? 0n, 18)} ${nativeSymbol}` : ''
}

export function activityAssetEffect(activity: ActivityRecord, nativeSymbol = 'ETH') {
  const actionIds = (activity.recognizedActions || []).map((action) => action.id)
  const recognizedAssetAction = actionIds.some(
    (id) => typeof id === 'string' && ['erc20:transfer', 'erc20:approve', 'erc20:revoke'].includes(id)
  )
  const decodedAssetAction = ['approve', 'transfer'].includes(activity.decodedData?.method || '')
  const nativeTransfer =
    activity.classification === 'NATIVE_TRANSFER' ||
    (activity.display?.title || '').startsWith(`Send ${nativeSymbol}`)
  const titleMatch = /^(Send|Approve|Revoke)\s+(.+?)(?:\s+allowance)?$/.exec(activity.display?.title || '')
  const token = activity.tokenData || {}
  const withAssetMetadata = (effect: ActivityBalanceChange): ActivityBalanceChange => ({
    ...effect,
    ...(effect.kind !== 'native' && (effect.assetAddress || token.address || activity.data?.to)
      ? { assetAddress: effect.assetAddress || token.address || activity.data?.to }
      : {}),
    ...(effect.logoURI || token.logoURI ? { logoURI: effect.logoURI || token.logoURI } : {})
  })

  if (!recognizedAssetAction && !decodedAssetAction && !nativeTransfer && !titleMatch) return undefined

  const effect = getTransactionEffects(activityRequestLike(activity), nativeSymbol).find(
    (effect) => effect.kind === 'erc20' || effect.kind === 'allowance' || effect.kind === 'native'
  )
  if (effect) return withAssetMetadata(effect)

  const balanceEffect = activityBalanceChanges(activity, nativeSymbol).find(
    (change) => change.kind === 'erc20' || change.kind === 'native'
  )
  if (balanceEffect) return withAssetMetadata(balanceEffect)

  if (!titleMatch) return undefined

  const [, action, displaySymbol] = titleMatch
  const symbol = token.symbol || displaySymbol
  const isNative = action === 'Send' && symbol === nativeSymbol

  return {
    id: 'activity-display-asset',
    kind: isNative ? 'native' : action === 'Send' ? 'erc20' : 'allowance',
    direction: action === 'Send' ? 'out' : 'neutral',
    label: activity.display?.title || 'Asset',
    symbol,
    ...(!isNative && (token.address || activity.data?.to)
      ? { assetAddress: token.address || activity.data?.to }
      : {}),
    ...(token.logoURI ? { logoURI: token.logoURI } : {})
  }
}

export function createActivityRows({
  accountAddress,
  activity,
  networks,
  selectedChainId,
  showTestnets
}: {
  accountAddress: string
  activity: Record<string, WalletActivityRecord | ActivityRecord>
  networks: ActivityNetworkMap
  selectedChainId: number
  showTestnets: boolean
}) {
  const address = accountAddress.toLowerCase()
  return Object.values(activity)
    .map(projectActivityRecord)
    .filter((record): record is ActivityViewRecord => {
      const recordAddress = String(record.account || record.address || '').toLowerCase()
      const chainId = Number(record.chainId)
      const chain = networks[chainId]
      return (
        Boolean(record.id) &&
        recordAddress === address &&
        !!chain &&
        (!chain.isTestnet || showTestnets) &&
        (selectedChainId === 0 || selectedChainId === chainId)
      )
    })
    .sort(
      (a, b) =>
        timestamp(b.submittedAt, timestamp(b.updatedAt, 0)) -
        timestamp(a.submittedAt, timestamp(a.updatedAt, 0))
    )
}
