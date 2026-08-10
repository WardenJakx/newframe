import { resolveSendAssetFromRouteAssetId, toCanonicalAssetId } from '../../../../app/contracts/sidetray'
import type { BalanceSummary } from '../../../asset-data/domain/balance'
import type { SideTrayRendererState } from '../../../../platform/state-sync/contract/projections'
import { cleanAddress } from './sendTransaction'
import type { SendAccountViewModel, SendSubmissionViewModel } from './sendViewModel'

export function selectSendAsset(
  balances: BalanceSummary[],
  selectedAssetKey?: string | null
): BalanceSummary | null {
  return (
    balances.find((balance) => toCanonicalAssetId(balance) === selectedAssetKey) ||
    resolveSendAssetFromRouteAssetId(selectedAssetKey, balances) ||
    balances[0] ||
    null
  )
}

export function filterSendRecipients(accounts: SendAccountViewModel[], sender?: SendAccountViewModel | null) {
  const senderAddress = cleanAddress(sender?.address)
  return accounts.filter((account) => {
    if (sender?.id && account.id === sender.id) return false
    return !senderAddress || cleanAddress(account.address) !== senderAddress
  })
}

export function projectSendSubmission({
  activity,
  operationId,
  operations
}: {
  activity: SideTrayRendererState['activity']
  operationId?: string
  operations: SideTrayRendererState['operations']
}): SendSubmissionViewModel {
  if (!operationId) return { error: '', status: '', submitting: false }

  const operation = operations[operationId]
  const transactionId = operation?.entityRefs?.find((reference) => reference.type === 'transaction')?.id
  const projectedActivity = transactionId ? activity[transactionId] : undefined
  const submitting =
    !operation || operation.status === 'pending' || (operation.status === 'succeeded' && !projectedActivity)

  return {
    error: operation?.status === 'failed' ? operation.error?.message || '' : '',
    status:
      operation?.status === 'succeeded' && projectedActivity
        ? 'Transaction submitted'
        : submitting
          ? 'Confirm in Newframe'
          : '',
    submitting
  }
}
