import { timestamp } from '../../StatusNotifications'
import { getPaidTransactionFee, getTransactionEffects } from '../../../../../domain/transaction'
import { formatUnits, toBigInt } from '../../../../../domain/units'

export function transactionStatusLabel(status?: string) {
  if (status === 'submitted') return 'Submitted'
  if (status === 'confirming') return 'Confirming'
  if (status === 'succeeded') return 'Confirmed'
  if (status === 'reverted') return 'Reverted'
  return 'Submitted'
}

export function requestStatusFromActivity(status?: string) {
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

export function activityRequestLike(activity: any) {
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

export function activityTimestampLabel(activity: any) {
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

export function activityBalanceChanges(activity: any, nativeSymbol = 'ETH') {
  if (Array.isArray(activity.balanceChanges)) return activity.balanceChanges

  return getTransactionEffects(activityRequestLike(activity), nativeSymbol).filter(
    (effect) => effect.direction === 'in' || effect.direction === 'out'
  )
}

export function activityGasSpent(activity: any) {
  return activity.gasSpent || getPaidTransactionFee(activityRequestLike(activity))
}

export function activityBalanceChangeLabel(activity: any, nativeSymbol = 'ETH') {
  const changes = activityBalanceChanges(activity, nativeSymbol)
  if (!changes.length) return ''

  const labels = changes.slice(0, 2).map((change: any) => {
    const sign = change.direction === 'in' ? '+' : '−'
    const amount = formatUnits(toBigInt(change.amount) ?? 0n, change.decimals ?? 18)
    return `${sign}${amount} ${change.symbol || '?'}`
  })
  const remaining = changes.length - labels.length

  return `${labels.join(' · ')}${remaining > 0 ? ` · +${remaining} more` : ''}`
}

export function activityGasLabel(activity: any, nativeSymbol = 'ETH') {
  const gasSpent = activityGasSpent(activity)
  return gasSpent ? `Gas ${formatUnits(toBigInt(gasSpent) ?? 0n, 18)} ${nativeSymbol}` : ''
}

export function activityAssetEffect(activity: any, nativeSymbol = 'ETH') {
  const actionIds = (activity.recognizedActions || []).map((action: any) => action?.id)
  const recognizedAssetAction = actionIds.some((id: string) =>
    ['erc20:transfer', 'erc20:approve', 'erc20:revoke'].includes(id)
  )
  const decodedAssetAction = ['approve', 'transfer'].includes(activity.decodedData?.method)
  const nativeTransfer =
    activity.classification === 'NATIVE_TRANSFER' ||
    (activity.display?.title || '').startsWith(`Send ${nativeSymbol}`)

  if (!recognizedAssetAction && !decodedAssetAction && !nativeTransfer) return undefined

  return getTransactionEffects(activityRequestLike(activity), nativeSymbol).find(
    (effect) => effect.kind === 'erc20' || effect.kind === 'allowance' || effect.kind === 'native'
  )
}

export function createActivityRows({
  accountAddress,
  activity,
  networks,
  selectedChainId,
  showTestnets
}: {
  accountAddress: string
  activity: Record<string, any>
  networks: Record<string | number, any>
  selectedChainId: number
  showTestnets: boolean
}) {
  const address = accountAddress.toLowerCase()
  return Object.values(activity)
    .filter((record) => {
      const recordAddress = String(record.account || record.address || '').toLowerCase()
      const chainId = Number(record.chainId)
      const chain = networks[chainId]
      return (
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
