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

export type SafePreview = SafeProposalSimulation | { status: 'loading' }

export function SafeProposalDetailsView({
  renderAddress,
  deployment,
  proposal,
  owners = [],
  selectedOwnerId,
  onSelectOwner,
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
  owners?: SafeOwnerAccount[]
  selectedOwnerId?: string
  onSelectOwner?: (accountId: string) => void
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
              disabled={!hasSigningAccount}
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
                    {owner.name ? <Text truncate>{owner.name}</Text> : null}
                    <AddressIdentity
                      address={owner.address}
                      nickname={shortAddress(owner.address)}
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
          <RequestActions
            primary={{
              label:
                selectedOwner && !selectedOwner.signerAttached
                  ? 'No signer attached'
                  : hasEnoughConfirmations
                    ? 'Execute'
                    : 'Sign',
              disabled: true,
              onPress: () => {}
            }}
            secondary={{ label: 'Decline', disabled: true, onPress: () => {} }}
          />
        </Stack>
      </TransactionInformation>
    </section>
  )
}
