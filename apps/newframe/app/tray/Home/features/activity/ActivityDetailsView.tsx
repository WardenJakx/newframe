import React from 'react'

import link from '../../../../../resources/link'
import svg from '../../../../../resources/svg'
import TransactionInformation from '../../../Account/Requests/TransactionRequest/TransactionInformation'
import {
  getTransactionEffects,
  getTransactionIntent,
  TRANSACTION_CONFIRMATION_TARGET
} from '../../../../../resources/domain/transaction'
import { activateOnKeyboard } from '../../ui/keyboard'
import { activityRequestLike, requestStatusFromActivity, transactionStatusLabel } from './activityModel'

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
  const intent = getTransactionIntent(req, symbol)
  const effects = getTransactionEffects(req, symbol)
  const receiptBlock = activity.receipt?.blockNumber ? parseInt(activity.receipt.blockNumber, 16) : undefined
  const copy = (value?: string) => {
    if (value) void link.executeCommand({ type: 'clipboard.write', text: value })
  }
  const from = activity.data?.from || activity.account || activity.address
  const to = activity.data?.to
  const details = [
    { label: 'Origin', value: originName },
    { label: 'From', value: shortAddress(from), onClick: () => copy(from) },
    { label: 'To', value: activity.recipient || shortAddress(to), onClick: () => copy(to) },
    { label: 'Nonce', value: activity.nonce },
    { label: 'Hash', value: shortAddress(activity.hash), onClick: () => copy(activity.hash) },
    { label: 'Contract', value: activity.decodedData?.contractName },
    { label: 'Method', value: activity.decodedData?.method },
    { label: 'Decode source', value: activity.decodedData?.source },
    { label: 'Block', value: receiptBlock ? String(receiptBlock) : undefined }
  ]

  return (
    <div
      aria-label='Transaction activity details'
      className='t2Overlay t2ActivityOverlay cardShow'
      role='dialog'
    >
      <div className='t2OverlayHeader'>
        <div
          aria-label='Back to activity'
          className='t2OverlayBack'
          onClick={onBack}
          onKeyDown={(event) => activateOnKeyboard(event, onBack)}
          role='button'
          tabIndex={0}
        >
          {svg.chevronLeft(13)}
        </div>
        <div className='t2OverlayTitle'>Activity</div>
        <div className='t2OverlaySpacer' />
      </div>
      <div className='t2OverlayScroll t2ActivityDetailScroll'>
        <TransactionInformation
          details={details}
          effects={effects}
          effectsEmptyText='No direct asset changes detected'
          nativeCurrency={nativeCurrency}
          networkColor={networkMeta.primaryColor ? `var(--${networkMeta.primaryColor})` : undefined}
          networkName={network.name || `Chain ${chainId}`}
          notice={activity.status === 'reverted' ? 'Transaction reverted on-chain' : undefined}
          progress={{
            status: requestStatusFromActivity(activity.status),
            notice: transactionStatusLabel(activity.status),
            txHash: activity.hash,
            confirmations: activity.confirmations || 0,
            confirmationTarget: TRANSACTION_CONFIRMATION_TARGET,
            blockNumber: receiptBlock
          }}
          statusLabel={transactionStatusLabel(activity.status)}
          subtitle={activity.display?.subtitle || intent.subtitle}
          title={activity.display?.title || intent.title}
        />
      </div>
    </div>
  )
}
