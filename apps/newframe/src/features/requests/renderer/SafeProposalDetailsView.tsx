import { Disclosure } from '@newframe/ui/disclosure'
import { Selection } from '@newframe/ui/selection'
import { Stack } from '@newframe/ui/stack'
import { Text } from '@newframe/ui/text'
import { formatUnits } from 'ethers'
import { useState, type ReactNode } from 'react'

import { getCalldataDigest } from '../../../shared/domain/calldata'
import { AddressIdentity, shortAddress } from '../../../shared/renderer/ui/AddressIdentity'
import {
  signerIsReady,
  signerStatusText,
  signerTypeLabel
} from '../../../shared/renderer/ui/signerPresentation'
import type {
  SafeDeployment,
  SafeOwnerAccount,
  SafeProposal,
  SafeProposalSimulation
} from '../../accounts/domain/safe'
import TransactionInformation from './Account/Requests/TransactionRequest/TransactionInformation'
import type { RequestRendererCapabilities } from './requestCapabilities'
import { RequestActions } from './ui/RequestActions'
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
  const [ownerMenuOpen, setOwnerMenuOpen] = useState(false)
  const [confirmationsOpen, setConfirmationsOpen] = useState(false)
  const selectedOwner = owners.find((owner) => owner.accountId === selectedOwnerId)
  const hasSigningAccount = owners.some((owner) => owner.status !== 'watch-only')
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
  const actionLabel = published
    ? 'Confirmation published'
    : confirmation?.status === 'publishing'
      ? 'Publishing…'
      : confirmation?.status === 'signing'
        ? 'Signing…'
        : retryPublication
          ? 'Retry publication'
          : selectedOwner && !selectedOwner.signerAttached
            ? 'No signer attached'
            : recoverable
              ? 'Connect signer'
              : 'Sign'
  const ownerDescription = (owner: SafeOwnerAccount) => {
    const type = signerTypeLabel(owner.signerType)
    return signerIsReady(owner.signerStatus)
      ? type
      : `${type} · ${signerStatusText({ status: owner.signerStatus, type })}`
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
  const effectsEmptyText =
    simulation.status === 'loading'
      ? 'Simulating…'
      : simulation.status === 'success'
        ? 'No supported asset changes detected.'
        : simulation.status === 'unavailable'
          ? 'Simulation unavailable.'
          : simulation.failure === 'revert'
            ? 'Execution reverted. No changes applied.'
            : 'No remaining asset or allowance changes detected.'
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

  return (
    <section aria-label='Request review'>
      <TransactionInformation
        imageCapability={capabilities.external}
        originName='Safe proposal'
        clipboard={capabilities.external}
        actionTitle={
          nativeTransfer
            ? `Send ${nativeAmount}`
            : proposal.localDecoded
              ? `Call ${proposal.localDecoded.method}`
              : 'Call contract'
        }
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
        statusLabel={
          stale
            ? 'Stale proposal'
            : waiting
              ? 'Waiting for earlier transactions'
              : hasEnoughConfirmations
                ? 'Awaiting execution'
                : 'Pending proposal'
        }
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
            <Selection
              label='Signer'
              disabled={!hasSigningAccount || busy}
              menuPlacement='above'
              menuAlign='end'
              menuWidth='wide'
              triggerSize='small'
              open={ownerMenuOpen && hasSigningAccount}
              onOpenChange={setOwnerMenuOpen}
              selectedId={selectedOwnerId}
              onSelect={(id) => onSelectOwner?.(id)}
              placeholder={hasSigningAccount && !selectedOwner}
              trigger={
                hasSigningAccount && selectedOwner ? (
                  <AddressIdentity
                    address={selectedOwner.address}
                    accountType={selectedOwner.accountType ?? selectedOwner.signerType}
                    nickname={selectedOwner.name || shortAddress(selectedOwner.address)}
                    showCopy={false}
                    showFullAddress
                  />
                ) : (
                  <Text variant='caption' truncate={hasSigningAccount}>
                    {hasSigningAccount ? 'Choose an account' : 'No attached signer for the Safe'}
                  </Text>
                )
              }
              items={owners.map((owner) => ({
                id: owner.accountId,
                disabled: owner.status === 'watch-only',
                content: (
                  <Stack gap='none' grow>
                    <AddressIdentity
                      address={owner.address}
                      accountType={owner.accountType ?? owner.signerType}
                      nickname={owner.name || shortAddress(owner.address)}
                      showCopy={false}
                      showFullAddress
                    />
                    <Text variant='caption' tone='secondary'>
                      {ownerDescription(owner)}
                    </Text>
                  </Stack>
                )
              }))}
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
                  onRecoverSigner?.()
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
