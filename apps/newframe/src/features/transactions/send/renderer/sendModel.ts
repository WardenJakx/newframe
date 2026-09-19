import { resolveSendAssetFromRouteAssetId, toCanonicalAssetId } from '../../../../app/contracts/sidetray'
import type { SideTrayRendererState } from '../../../../platform/state-sync/contract/projections'
import type { BalanceSummary } from '../../../asset-data/domain/balance'
import { cleanAddress } from './sendTransaction'
import type { SendAccountViewModel, SendSubmissionViewModel } from './sendViewModel'

export function resolveSendRouteAsset(
  assetId: string | null | undefined,
  balances: BalanceSummary[]
): BalanceSummary | null {
  return resolveSendAssetFromRouteAssetId(assetId, balances)
}

type SparseOperation = Omit<SideTrayRendererState['operations'][string], 'entityRefs'> & {
  entityRefs?: SideTrayRendererState['operations'][string]['entityRefs']
}

export function selectSendAsset(
  balances: BalanceSummary[],
  selectedAssetKey?: string | null
): BalanceSummary | null {
  return (
    balances.find((balance) => toCanonicalAssetId(balance) === selectedAssetKey) ??
    resolveSendRouteAsset(selectedAssetKey, balances) ??
    balances.at(0) ??
    null
  )
}

export function filterSendRecipients(accounts: SendAccountViewModel[], sender?: SendAccountViewModel | null) {
  const senderAddress = cleanAddress(sender?.address)
  return accounts.filter((account) => {
    if (sender?.id && account.id === sender.id) {
      return false
    }
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
  if (!operationId) {
    return { error: '', status: '', submitting: false }
  }

  const operation = (operations as Record<string, SparseOperation | undefined>)[operationId]
  const transactionId = operation?.entityRefs?.find((reference) => reference.type === 'transaction')?.id
  const projectedActivity = transactionId ? (activity as Partial<typeof activity>)[transactionId] : undefined
  const submitting =
    !operation || operation.status === 'pending' || (operation.status === 'succeeded' && !projectedActivity)
  let status = ''
  if (operation?.status === 'succeeded' && projectedActivity) {
    status = 'Transaction submitted'
  } else if (submitting) {
    status = 'Confirm in Newframe'
  }

  return {
    error: operation?.status === 'failed' ? (operation.error?.message ?? '') : '',
    status,
    submitting
  }
}
