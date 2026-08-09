import React from 'react'

import { resolveSendAssetFromRouteAssetId, toCanonicalAssetId } from '../../../../app/contracts/sidetray'
import {
  createBalanceTokenSelectorItem,
  createDisplayBalance,
  formatUsdRate
} from '../../../asset-data/domain/balance'
import { formatUnits, toBigInt } from '../../../../shared/domain/units'
import { createSideTrayWalletSelector } from '../../../../platform/state-sync/renderer/selectors/sideTrayWallet'
import { useSideTraySelector } from '../../../../platform/state-sync/renderer/useAppSelector'
import { getTokenSelectorPage } from '../../../../shared/renderer/ui/tokenSelectorModel'
import { hasSentToAddress } from './sendHistory'
import { filterSendRecipients, projectSendSubmission, selectSendAsset } from './sendModel'
import { createInitialSendState, sendReducer } from './sendReducer'
import type { SendCapability } from './sendService'
import { canProceed, getAmountBaseUnits, validateSendDraft } from './sendValidation'
import type {
  SendAccountViewModel,
  SendSelectedAssetViewModel,
  SendViewEvents,
  SendViewModel
} from './sendViewModel'

interface ActiveSubmission {
  accountId: string
  operationId: string
}

export function useSendController({
  assetId,
  capability
}: {
  assetId?: string | null
  capability: SendCapability
}): { events: SendViewEvents; model: SendViewModel } {
  const selector = React.useMemo(() => createSideTrayWalletSelector(), [])
  const { accounts, activity, balanceSummaries, currentAccount, networks, networksMeta, operations } =
    useSideTraySelector(selector)
  const [state, dispatch] = React.useReducer(sendReducer, assetId, createInitialSendState)
  const previousAccountIdRef = React.useRef(currentAccount?.id || '')
  const [submission, setSubmission] = React.useState<ActiveSubmission | null>(null)
  const submissionRef = React.useRef(submission)
  const setActiveSubmission = React.useCallback((next: ActiveSubmission | null) => {
    submissionRef.current = next
    setSubmission(next)
  }, [])

  const selectedAssetSummary = React.useMemo(
    () => selectSendAsset(balanceSummaries, state.selectedAssetKey),
    [balanceSummaries, state.selectedAssetKey]
  )
  const asset = React.useMemo(
    () => (selectedAssetSummary ? createDisplayBalance(selectedAssetSummary) : null),
    [selectedAssetSummary]
  )

  React.useEffect(() => {
    const accountId = currentAccount?.id || ''
    if (previousAccountIdRef.current === accountId) return

    previousAccountIdRef.current = accountId
    const retainedAsset =
      balanceSummaries.find((balance) => toCanonicalAssetId(balance) === state.selectedAssetKey) ||
      resolveSendAssetFromRouteAssetId(assetId, balanceSummaries) ||
      balanceSummaries[0] ||
      null
    queueMicrotask(() => {
      if ((currentAccount?.id || '') !== accountId) return
      setActiveSubmission(null)
      dispatch({
        type: 'accountChanged',
        selectedAssetKey: retainedAsset ? toCanonicalAssetId(retainedAsset) : ''
      })
    })
  }, [assetId, balanceSummaries, currentAccount?.id, setActiveSubmission, state.selectedAssetKey])

  const recipientAccounts = React.useMemo<SendAccountViewModel[]>(
    () => filterSendRecipients(accounts, currentAccount),
    [accounts, currentAccount]
  )

  const handleSubmit = React.useCallback(async () => {
    const submittingAccountId = currentAccount?.id || ''
    const amount = getAmountBaseUnits(state.amount, asset)
    const balance = asset ? toBigInt(asset.balance) || 0n : 0n
    const recipient = state.recipient?.address || state.recipientInput.trim()
    const error = validateSendDraft({
      account: currentAccount,
      amount,
      asset,
      balance,
      recipient
    })

    if (error) {
      dispatch({ type: 'validationFailed', error })
      return
    }

    const operationId = crypto.randomUUID()
    setActiveSubmission({ accountId: submittingAccountId, operationId })
    try {
      const response = await capability.submit({
        operationId,
        asset: { address: asset!.address, chainId: asset!.chainId },
        amount: amount!.toString(),
        recipient
      })
      if (submissionRef.current?.operationId !== operationId || response.ok) return
      setActiveSubmission(null)
      dispatch({ type: 'validationFailed', error: response.message || 'Transaction failed.' })
    } catch {
      if (submissionRef.current?.operationId !== operationId) return
      setActiveSubmission(null)
      dispatch({ type: 'validationFailed', error: 'Transaction failed.' })
    }
  }, [
    asset,
    capability,
    currentAccount,
    setActiveSubmission,
    state.amount,
    state.recipient,
    state.recipientInput
  ])

  const selectedKey = toCanonicalAssetId(asset)
  const { items: selectorBalances, rowsHidden } = getTokenSelectorPage({
    getId: toCanonicalAssetId,
    items: balanceSummaries,
    open: state.tokenOpen,
    rowsVisible: state.tokenRowsVisible,
    selectedId: selectedKey
  })
  const amountValue = Number(state.amount || 0)
  const price = asset?.rate?.usdRate
  const submissionModel = projectSendSubmission({
    activity,
    operationId: submission?.operationId,
    operations
  })
  const selectedAsset: SendSelectedAssetViewModel | null = asset
    ? {
        address: asset.address,
        balance: asset.balance,
        chainId: asset.chainId,
        decimals: asset.decimals,
        displayBalance: asset.displayBalance,
        symbol: asset.symbol
      }
    : null

  const model: SendViewModel = {
    amount: state.amount,
    fiatValue:
      typeof price !== 'number'
        ? '—'
        : amountValue > 0
          ? `$${formatUsdRate(amountValue * price, 2)}`
          : '$0.00',
    firstTimeRecipient:
      !!state.recipient &&
      !hasSentToAddress({
        activity,
        recipientAddress: state.recipient.address,
        senderAddress: currentAccount?.address
      }),
    networks,
    networksMeta,
    recipient: state.recipient,
    recipientAccounts,
    recipientInput: state.recipientInput,
    recipientOpen: state.recipientOpen,
    rowsHidden,
    searchableTokenItems: balanceSummaries.map(createBalanceTokenSelectorItem),
    selectedAsset,
    selectedAssetKey: selectedKey,
    submission: submissionModel,
    tokenItems: selectorBalances.map(createBalanceTokenSelectorItem),
    tokenOpen: state.tokenOpen,
    validation: {
      error: state.error,
      proceedEnabled:
        canProceed({
          amount: state.amount,
          asset,
          recipient: state.recipient,
          recipientInput: state.recipientInput
        }) && !submissionModel.submitting
    }
  }

  const events: SendViewEvents = {
    onAmountChange: (amount) => dispatch({ type: 'setAmount', amount }),
    onClearRecipient: () => dispatch({ type: 'clearRecipient' }),
    onClose: () => void capability.close(),
    onRecipientInputChange: (recipientInput) => dispatch({ type: 'setRecipientInput', recipientInput }),
    onSelectAsset: (selectedAssetKey) => dispatch({ type: 'selectAsset', selectedAssetKey }),
    onSelectRecipient: (recipient) => dispatch({ type: 'selectRecipient', recipient }),
    onSetMax: () => {
      if (!asset) return
      dispatch({
        type: 'setMaxAmount',
        amount: formatUnits(toBigInt(asset.balance) || 0n, asset.decimals)
      })
    },
    onShowMoreTokens: () => dispatch({ type: 'showMoreTokens' }),
    onSubmit: () => void handleSubmit(),
    onTokenPickerOpenChange: (tokenOpen) => dispatch({ type: 'setTokenOpen', tokenOpen }),
    onToggleRecipients: () => dispatch({ type: 'toggleRecipientOpen' })
  }

  return { events, model }
}
