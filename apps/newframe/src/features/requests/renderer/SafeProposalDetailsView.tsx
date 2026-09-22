import { Disclosure } from '@newframe/ui/disclosure'
import { Inline } from '@newframe/ui/inline'
import { Stack } from '@newframe/ui/stack'
import { Text } from '@newframe/ui/text'
import { useState, type ReactNode } from 'react'

import { getCalldataDigest } from '../../../shared/domain/calldata'
import { AddressIdentity, shortAddress } from '../../../shared/renderer/ui/AddressIdentity'
import type { SafeDeployment, SafeProposal, SafeProposalSimulation } from '../../accounts/domain/safe'
import type { TransactionApprovalAdjustments } from '../../transactions/domain/approval'
import type { TransactionFeeField } from '../../transactions/domain/fees'
import { TxClassification, type SafeExecutionMetadata, type SigningCandidate } from '../contract/requests'
import type { useAssetRate, useAddressIdentities, useTokens } from './Account/Requests/state'
import AdjustFee from './Account/Requests/TransactionRequest/AdjustFee'
import { TxReviewView, type TxReviewData } from './Account/Requests/TransactionRequest/TxReview'
import type { RequestRendererCapabilities } from './requestCapabilities'
import { RequestActions } from './ui/RequestActions'
import { RequestSigningFooter } from './ui/RequestSigningFooter'
import { SafeOwnerSelector } from './ui/SafeOwnerSelector'
import { SigningAccount } from './ui/SigningAccount'

export type SafePreview = SafeProposalSimulation | { status: 'loading' }

type SafeAction = {
  disabled?: boolean
  label: string
  onPress: () => void
}

export type SafeProposalActionModel = {
  status:
    | 'collecting'
    | 'signing'
    | 'publishing'
    | 'publication_failed'
    | 'ready'
    | 'preparing'
    | 'executing'
    | 'submitted'
    | 'failed'
  confirmations: string[]
  threshold: number
  publication: 'local' | 'publishing' | 'published' | 'failed'
  owners: SigningCandidate[]
  selectedOwnerId?: string
  onSelectOwner?: (accountId: string) => void
  ownerAction?: SafeAction
  executors: SigningCandidate[]
  selectedExecutorId?: string
  onSelectExecutor?: (accountId: string) => void
  executionAction?: SafeAction
  reviewedTransaction?: SafeExecutionMetadata['reviewedTransaction']
  executionWarnings?: string[]
  outerTxHash?: string
  adjustments?: TransactionApprovalAdjustments
  onUpdateFee?: (field: TransactionFeeField, value: bigint) => void
  decline?: SafeAction
  message?: string
}

export function SafeProposalDetailsView({
  renderAddress,
  deployment,
  proposal,
  simulation,
  networkName,
  networkIcon,
  symbol,
  decimals = 18,
  originName,
  favicon,
  accountName,
  isTestnet = false,
  nativeCurrencyRate,
  identities,
  tokens,
  capabilities,
  actions
}: {
  renderAddress?: (address: string) => ReactNode
  deployment: SafeDeployment
  proposal: SafeProposal
  simulation: SafePreview
  networkName: string
  networkIcon?: string
  symbol: string
  decimals?: number
  originName?: string
  favicon?: string
  accountName?: string
  isTestnet?: boolean
  nativeCurrencyRate?: ReturnType<typeof useAssetRate>
  identities?: ReturnType<typeof useAddressIdentities>
  tokens?: ReturnType<typeof useTokens>
  capabilities: Pick<RequestRendererCapabilities, 'external'>
  actions?: SafeProposalActionModel
}) {
  const [confirmationsOpen, setConfirmationsOpen] = useState(false)
  const [feesOpen, setFeesOpen] = useState(false)
  const [executionDetailsOpen, setExecutionDetailsOpen] = useState(false)
  const owners = actions?.owners ?? []
  const selectedOwner = owners.find((owner) => owner.accountId === actions?.selectedOwnerId)
  const currentNonce =
    simulation.status !== 'loading' && simulation.currentNonce !== undefined
      ? simulation.currentNonce
      : deployment.configuration.nonce
  const waiting = BigInt(proposal.nonce) > BigInt(currentNonce)
  const stale = BigInt(proposal.nonce) < BigInt(currentNonce)
  const confirmations = actions?.confirmations ?? proposal.confirmations
  const threshold = actions?.threshold ?? deployment.configuration.threshold
  const confirmedOwners = new Set(confirmations.map((address) => address.toLowerCase()))
  const hasEnoughConfirmations = actions
    ? ['ready', 'preparing', 'executing', 'submitted'].includes(actions.status)
    : deployment.configuration.owners.filter((owner) => confirmedOwners.has(owner.toLowerCase())).length >=
      threshold
  const effects =
    simulation.status === 'success' || (simulation.status === 'error' && simulation.failure === 'inner')
      ? simulation.effects
      : []
  let effectsEmptyText = 'No remaining asset or allowance changes detected.'
  if (simulation.status === 'loading') {
    effectsEmptyText = 'Simulating…'
  } else if (simulation.status === 'success') {
    effectsEmptyText = 'No supported asset changes detected.'
  } else if (simulation.status === 'unavailable') {
    effectsEmptyText = 'Simulation unavailable.'
  } else if (simulation.failure === 'revert') {
    effectsEmptyText = 'Execution reverted. No changes applied.'
  }
  const effectsNotice =
    simulation.status === 'error' || simulation.status === 'unavailable' ? simulation.error : undefined
  const addressValue = (address: string) =>
    renderAddress?.(address) ?? (
      <AddressIdentity
        address={address}
        accountType={address.toLowerCase() === proposal.safe.toLowerCase() ? 'safe' : undefined}
        clipboard={capabilities.external}
        nickname={shortAddress(address)}
        showFullAddress
      />
    )
  const nativeTransfer = proposal.data === '0x' && proposal.operation === 0
  const review: TxReviewData = {
    origin: proposal.local?.origin ?? 'Safe proposal',
    data: {
      chainId: `0x${deployment.chainId.toString(16)}`,
      from: proposal.safe,
      to: proposal.to,
      value: proposal.value,
      data: proposal.data,
      ...(proposal.data !== '0x' ? { calldataDigest: getCalldataDigest(proposal.data) } : {})
    },
    classification: nativeTransfer ? TxClassification.NATIVE_TRANSFER : TxClassification.CONTRACT_CALL,
    // Local decoding has no verified ABI signature. Keep it as generic method/argument display.
    decodedData: proposal.localDecoded
      ? { method: proposal.localDecoded.method, args: proposal.localDecoded.parameters }
      : undefined
  }
  const verification = [
    { label: 'Safe transaction hash', value: proposal.safeTxHash },
    ...(actions?.outerTxHash ? [{ label: 'Outer transaction hash', value: actions.outerTxHash }] : []),
    ...(proposal.integrity?.status === 'mismatch' && proposal.integrity.computedHash
      ? [
          {
            label: 'Locally computed hash',
            value: proposal.integrity.computedHash
          }
        ]
      : [])
  ]
  let statusLabel = 'Pending proposal'
  if (stale) {
    statusLabel = 'Stale proposal'
  } else if (waiting) {
    statusLabel = 'Waiting for earlier transactions'
  } else if (hasEnoughConfirmations) {
    statusLabel = actions?.status === 'submitted' ? 'Submitted' : 'Ready · awaiting execution'
  }

  const reviewed = actions?.reviewedTransaction
  const selectedExecutor = actions?.executors.find(
    (candidate) => candidate.accountId === actions.selectedExecutorId
  )
  const outerDetails = reviewed
    ? [
        {
          label: 'Executor',
          value: reviewed.from ? addressValue(reviewed.from) : (selectedExecutor?.name ?? 'Unknown executor')
        },
        ...(reviewed.nonce ? [{ label: 'Outer nonce', value: BigInt(reviewed.nonce).toString() }] : []),
        ...(reviewed.gasLimit ? [{ label: 'Gas limit', value: BigInt(reviewed.gasLimit).toString() }] : [])
      ]
    : []
  const showExecution = Boolean(actions) && hasEnoughConfirmations
  const primary = showExecution ? actions?.executionAction : actions?.ownerAction
  const secondary = actions?.decline ?? { label: 'Decline', disabled: true, onPress: () => {} }
  let accountAction: ReactNode
  if (actions && !showExecution) {
    accountAction = (
      <Stack gap='none'>
        <Text tone='secondary' variant='caption'>
          Safe owner approval
        </Text>
        <SigningAccount label='Signer'>
          <SafeOwnerSelector
            owners={owners}
            label='Signer'
            disabled={actions.status === 'signing' || actions.status === 'publishing'}
            selectedOwnerId={actions.selectedOwnerId}
            onSelectOwner={actions.onSelectOwner}
          />
        </SigningAccount>
      </Stack>
    )
  } else if (actions && actions.status !== 'submitted') {
    accountAction = (
      <SigningAccount label='Gas-paying executor'>
        <SafeOwnerSelector
          owners={actions.executors}
          label='Gas-paying executor'
          placeholder='Choose an executor'
          emptyLabel='No available executor'
          disabled={actions.status === 'preparing' || actions.status === 'executing'}
          selectedOwnerId={actions.selectedExecutorId}
          onSelectOwner={actions.onSelectExecutor}
          ownerDisabled={(candidate) => candidate.status !== 'ready'}
        />
      </SigningAccount>
    )
  }
  let simulationActionWarning: string | undefined
  if (simulation.status === 'loading') {
    simulationActionWarning = 'Simulation is still loading. You can continue before it finishes.'
  } else if (hasEnoughConfirmations) {
    simulationActionWarning =
      'Simulation failed or is unavailable. Review the warning before explicit execution.'
  } else {
    simulationActionWarning = 'Simulation failed or is unavailable. You can still sign this proposal.'
  }
  let fallbackPrimaryLabel = 'Sign'
  if (actions) {
    fallbackPrimaryLabel = showExecution ? 'Choose an executor' : 'Choose an owner'
  }
  const canAdjustFee = actions?.status === 'ready' && Boolean(actions.onUpdateFee)

  return (
    <TxReviewView
      req={review}
      capabilities={capabilities}
      originName={originName ?? review.origin}
      favicon={favicon}
      network={{ name: networkName, isTestnet }}
      networkMetadata={{ nativeCurrency: { symbol, decimals } }}
      networkIcon={networkIcon}
      nativeCurrencyRate={nativeCurrencyRate}
      identities={identities}
      tokens={tokens}
      renderAddress={renderAddress}
      fee={
        reviewed
          ? {
              data: reviewed,
              editable: canAdjustFee,
              selectedRate: 'custom',
              openAdjustFee: () => setFeesOpen(true)
            }
          : undefined
      }
      extensions={{
        statusDetails: (
          <Disclosure
            label={`${confirmations.length} / ${threshold} confirmations`}
            open={confirmationsOpen}
            onToggle={() => setConfirmationsOpen((open) => !open)}
          >
            <Stack gap='xsmall'>
              {confirmations.length ? (
                confirmations.map((address) => <div key={address}>{addressValue(address)}</div>)
              ) : (
                <Text variant='caption' tone='secondary'>
                  No confirmations yet
                </Text>
              )}
            </Stack>
          </Disclosure>
        ),
        verification,
        rawTransaction: JSON.stringify(
          {
            safe: proposal.safe,
            to: proposal.to,
            value: proposal.value,
            data: proposal.data,
            operation: proposal.operation,
            nonce: proposal.nonce,
            safeTxGas: proposal.safeTxGas,
            baseGas: proposal.baseGas,
            gasPrice: proposal.gasPrice,
            gasToken: proposal.gasToken,
            refundReceiver: proposal.refundReceiver
          },
          null,
          2
        ),
        statusLabel,
        effects,
        effectsEmptyText,
        effectsNotice: effectsNotice ? (
          <div role={simulation.status === 'error' ? 'alert' : 'status'}>
            <Text variant='caption' tone={simulation.status === 'error' ? 'danger' : 'secondary'}>
              {effectsNotice}
            </Text>
          </div>
        ) : undefined,
        beforeDetails: (
          <Stack gap='small'>
            {proposal.integrity?.status !== 'matched' ? (
              <div aria-label='Proposal integrity' role='alert'>
                <Stack gap='xsmall'>
                  <Text variant='sectionTitle' tone='danger'>
                    {proposal.integrity?.status === 'mismatch'
                      ? 'Integrity mismatch'
                      : 'Verification unavailable'}
                  </Text>
                  <Text tone='danger' variant='caption'>
                    {proposal.integrity?.reason ??
                      'Unable to verify this cached proposal. Refresh the Safe queue.'}
                  </Text>
                </Stack>
              </div>
            ) : null}
            {waiting || stale ? (
              <div role='alert' aria-label='Safe nonce warning'>
                <Text tone='danger' variant='caption'>
                  {waiting
                    ? `Proposal nonce ${proposal.nonce} depends on earlier transactions. Current Safe nonce: ${currentNonce}. Simulation uses current state; earlier proposals are not included.`
                    : `Proposal nonce ${proposal.nonce} is stale. Current Safe nonce: ${currentNonce}. This proposal can no longer execute.`}
                </Text>
              </div>
            ) : null}
            {proposal.operation === 1 ? (
              <div role='alert' aria-label='Delegatecall warning'>
                <Text tone='danger' variant='caption'>
                  Delegatecall runs code with this Safe&apos;s permissions.
                </Text>
              </div>
            ) : null}
          </Stack>
        )
      }}
      footer={
        <RequestSigningFooter
          account={{ address: proposal.safe, name: accountName, accountType: 'safe' }}
          clipboard={capabilities.external}
          label='Account'
        >
          {reviewed && canAdjustFee && feesOpen && actions.onUpdateFee ? (
            <Disclosure label='Adjust gas fee' open={feesOpen} onToggle={() => setFeesOpen(false)}>
              <AdjustFee
                key={`${reviewed.from}:${reviewed.nonce}`}
                req={{ data: reviewed }}
                onUpdateFee={actions.onUpdateFee}
              />
            </Disclosure>
          ) : null}
          {accountAction}
          {reviewed ? (
            <Disclosure
              label='Execution details'
              open={executionDetailsOpen}
              onToggle={() => setExecutionDetailsOpen((open) => !open)}
            >
              <section aria-label='Reviewed executor transaction'>
                <Stack gap='xsmall'>
                  {outerDetails.map((detail) => (
                    <Inline key={detail.label} justify='between' gap='small'>
                      <Text tone='secondary' variant='caption'>
                        {detail.label}
                      </Text>
                      <Text variant='caption'>{detail.value}</Text>
                    </Inline>
                  ))}
                </Stack>
              </section>
            </Disclosure>
          ) : null}
          {reviewed?.warning ? (
            <div role='alert'>
              <Text tone='danger' variant='caption'>
                {reviewed.warning}
              </Text>
            </div>
          ) : null}
          {actions?.executionWarnings?.map((warning) => (
            <div key={warning} role='alert'>
              <Text tone='danger' variant='caption'>
                {warning}
              </Text>
            </div>
          ))}
          {actions &&
          (selectedOwner || hasEnoughConfirmations) &&
          actions.status !== 'submitted' &&
          simulation.status !== 'success' ? (
            <Text tone='secondary'>{simulationActionWarning}</Text>
          ) : null}
          {actions?.message ? (
            <div role={actions.status.endsWith('failed') ? 'alert' : 'status'}>
              <Text tone={actions.status.endsWith('failed') ? 'danger' : 'secondary'}>{actions.message}</Text>
            </div>
          ) : null}
          <RequestActions
            primary={
              primary ?? {
                label: fallbackPrimaryLabel,
                disabled: true,
                onPress: () => {}
              }
            }
            secondary={secondary}
          />
        </RequestSigningFooter>
      }
    />
  )
}
