import { timestamp } from '../../StatusNotifications'

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
