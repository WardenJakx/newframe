import { Disclosure } from '@newframe/ui/disclosure'
import { Stack } from '@newframe/ui/stack'
import { Text } from '@newframe/ui/text'
import { formatUnits } from 'ethers'
import { useState, type ReactNode } from 'react'

import { getCalldataDigest } from '../../../shared/domain/calldata'
import { AddressIdentity, shortAddress } from '../../../shared/renderer/ui/AddressIdentity'
import type {
  SafeDeployment,
  SafeOwnerAccount,
  SafeProposal,
  SafeProposalSimulation
} from '../../accounts/domain/safe'
import TransactionInformation from './Account/Requests/TransactionRequest/TransactionInformation'
import type { RequestRendererCapabilities } from './requestCapabilities'
import { RequestActions } from './ui/RequestActions'
import { SafeOwnerSelector } from './ui/SafeOwnerSelector'
import { SigningAccount } from './ui/SigningAccount'
import type { SafeConfirmationModel } from './useSafeConfirmation'

export type SafePreview = SafeProposalSimulation | { status: 'loading' }

export function SafeProposalDetailsView({
  renderAddress,
  deployment,
  proposal,
  owners = [],
  selectedOwnerId,
  onSelectOwner,
  confirmation,
  onRecoverSigner,
  simulation,
  networkName,
  networkIcon,
  symbol,
  decimals = 18,
  capabilities
}: {
  renderAddress?: (address: string) => ReactNode
  deployment: SafeDeployment
  proposal: SafeProposal
  owners?: Array<SafeOwnerAccount & { accountType?: string }>
  selectedOwnerId?: string
  onSelectOwner?: (accountId: string) => void
  confirmation?: SafeConfirmationModel
  onRecoverSigner?: () => void
  simulation: SafePreview
  networkName: string
  networkIcon?: string
  symbol: string
  decimals?: number
  capabilities: Pick<RequestRendererCapabilities, 'external'>
}) {
  const [confirmationsOpen, setConfirmationsOpen] = useState(false)
  const selectedOwner = owners.find((owner) => owner.accountId === selectedOwnerId)
  const busy = confirmation?.status === 'signing' || confirmation?.status === 'publishing'
  const published = confirmation?.status === 'published'
  const retryPublication = confirmation?.status === 'publication_failed'
  const appLocked = selectedOwner?.signerStatus === 'Wallet locked'
  const recoverable =
    !!selectedOwner?.signerAttached &&
    selectedOwner.status === 'unavailable' &&
    !appLocked &&
    !!onRecoverSigner
  const signingReady = selectedOwner?.status === 'ready'
  let actionLabel = 'Sign'
  if (published) {
    actionLabel = 'Confirmation published'
  } else if (confirmation?.status === 'publishing') {
    actionLabel = 'Publishing…'
  } else if (confirmation?.status === 'signing') {
    actionLabel = 'Signing…'
  } else if (retryPublication) {
    actionLabel = 'Retry publication'
  } else if (selectedOwner && !selectedOwner.signerAttached) {
    actionLabel = 'No signer attached'
  } else if (recoverable) {
    actionLabel = 'Connect signer'
  }
  const currentNonce =
    simulation.status !== 'loading' && simulation.currentNonce !== undefined
      ? simulation.currentNonce
      : deployment.configuration.nonce
  const waiting = BigInt(proposal.nonce) > BigInt(currentNonce)
  const stale = BigInt(proposal.nonce) < BigInt(currentNonce)
  const confirmedOwners = new Set(proposal.confirmations.map((address) => address.toLowerCase()))
  const hasEnoughConfirmations =
    deployment.configuration.owners.filter((owner) => confirmedOwners.has(owner.toLowerCase())).length >=
    deployment.configuration.threshold
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
  const nativeAmount = `${formatUnits(proposal.value, decimals)} ${symbol}`
  const details = [
    { label: nativeTransfer ? 'To' : 'On contract', value: addressValue(proposal.to) },
    ...(!nativeTransfer && BigInt(proposal.value) > 0n
      ? [{ label: 'Attached value', value: nativeAmount }]
      : []),
    ...(proposal.localDecoded?.parameters.map((parameter) => ({
      label: `${parameter.name} (${parameter.type})`,
      value: parameter.type === 'address' ? addressValue(parameter.value) : parameter.value
    })) ?? []),
    ...(!nativeTransfer && !proposal.localDecoded
      ? [{ label: 'Selector', value: proposal.data.slice(0, 10) }]
      : [])
  ]
  const verification = [
    { label: 'Safe transaction hash', value: proposal.safeTxHash },
    ...(proposal.integrity?.status === 'mismatch' && proposal.integrity.computedHash
      ? [
          {
            label: 'Locally computed hash',
            value: proposal.integrity.computedHash
          }
        ]
      : [])
  ]
  let actionTitle = 'Call contract'
  if (nativeTransfer) {
    actionTitle = `Send ${nativeAmount}`
  } else if (proposal.localDecoded) {
    actionTitle = `Call ${proposal.localDecoded.method}`
  }
  let statusLabel = 'Pending proposal'
  if (stale) {
    statusLabel = 'Stale proposal'
  } else if (waiting) {
    statusLabel = 'Waiting for earlier transactions'
  } else if (hasEnoughConfirmations) {
    statusLabel = 'Awaiting execution'
  }

  return (
    <section aria-label='Request review'>
      <TransactionInformation
        imageCapability={capabilities.external}
        originName='Safe proposal'
        clipboard={capabilities.external}
        actionTitle={actionTitle}
        actionNotice={
          !nativeTransfer && !proposal.localDecoded ? (
            <Text variant='caption' tone='secondary'>
              Cannot decode calldata. Inspect the selector and raw bytes.
            </Text>
          ) : undefined
        }
        statusDetails={
          <Disclosure
            label={`${proposal.confirmations.length} / ${deployment.configuration.threshold} confirmations`}
            open={confirmationsOpen}
            onToggle={() => setConfirmationsOpen((open) => !open)}
          >
            <Stack gap='xsmall'>
              {proposal.confirmations.length ? (
                proposal.confirmations.map((address) => <div key={address}>{addressValue(address)}</div>)
              ) : (
                <Text variant='caption' tone='secondary'>
                  No confirmations yet
                </Text>
              )}
            </Stack>
          </Disclosure>
        }
        verification={verification}
        rawTransaction={JSON.stringify(
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
        )}
        networkName={networkName}
        networkIcon={networkIcon}
        nativeCurrency={{ symbol }}
        statusLabel={statusLabel}
        effects={effects}
        effectsEmptyText={effectsEmptyText}
        effectsNotice={
          effectsNotice ? (
            <div role={simulation.status === 'error' ? 'alert' : 'status'}>
              <Text variant='caption' tone={simulation.status === 'error' ? 'danger' : 'secondary'}>
                {effectsNotice}
              </Text>
            </div>
          ) : undefined
        }
        beforeDetails={
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
        }
        details={details}
        wrapDetailValues
        calldata={{ digest: getCalldataDigest(proposal.data), data: proposal.data }}
      >
        <Stack gap='xsmall'>
          <SigningAccount label='Account'>{addressValue(proposal.safe)}</SigningAccount>
          <SigningAccount label='Signer'>
            <SafeOwnerSelector
              owners={owners}
              disabled={busy}
              selectedOwnerId={selectedOwnerId}
              onSelectOwner={onSelectOwner}
            />
          </SigningAccount>
          {confirmation && selectedOwner && !published && simulation.status !== 'success' ? (
            <Text tone='secondary'>
              {simulation.status === 'loading'
                ? 'Simulation is still loading. You can sign before it finishes.'
                : 'Simulation failed or is unavailable. You can still sign this proposal.'}
            </Text>
          ) : null}
          {confirmation?.message ? (
            <div role={confirmation.status.endsWith('failed') ? 'alert' : 'status'}>
              <Text tone={confirmation.status.endsWith('failed') ? 'danger' : 'secondary'}>
                {confirmation.message}
              </Text>
            </div>
          ) : null}
          <RequestActions
            primary={{
              label: actionLabel,
              disabled:
                !confirmation ||
                !selectedOwner ||
                busy ||
                published ||
                appLocked ||
                confirmation.status === 'loading' ||
                proposal.integrity?.status !== 'matched' ||
                (!retryPublication && !signingReady && !recoverable),
              onPress: () => {
                if (recoverable && !retryPublication) {
                  onRecoverSigner()
                } else {
                  confirmation?.onSign()
                }
              }
            }}
            secondary={{ label: 'Decline', disabled: true, onPress: () => {} }}
          />
        </Stack>
      </TransactionInformation>
    </section>
  )
}
