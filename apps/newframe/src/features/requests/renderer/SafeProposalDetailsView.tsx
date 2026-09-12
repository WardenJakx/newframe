import type { ReactNode } from 'react'
import { formatUnits } from 'ethers'
import { Surface } from '@newframe/ui/surface'
import { Stack } from '@newframe/ui/stack'
import { Text } from '@newframe/ui/text'
import { getCalldataDigest } from '../../../shared/domain/calldata'

import type { SafeDeployment, SafeProposal, SafeProposalSimulation } from '../../accounts/domain/safe'
import TransactionInformation from './Account/Requests/TransactionRequest/TransactionInformation'
import type { RequestRendererCapabilities } from './requestCapabilities'

export type SafePreview = SafeProposalSimulation | { status: 'loading' }

export function SafeProposalDetailsView({
  renderAddress,
  deployment,
  proposal,
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
  simulation: SafePreview
  networkName: string
  networkIcon?: string
  symbol: string
  decimals?: number
  capabilities: Pick<RequestRendererCapabilities, 'external'>
}) {
  const currentNonce =
    simulation.status !== 'loading' && simulation.currentNonce !== undefined
      ? simulation.currentNonce
      : deployment.configuration.nonce
  const waiting = BigInt(proposal.nonce) > BigInt(currentNonce)
  const effects =
    simulation.status === 'success' || (simulation.status === 'error' && simulation.failure === 'inner')
      ? simulation.effects
      : []
  const effectsEmptyText =
    simulation.status === 'loading'
      ? 'Simulating…'
      : simulation.status === 'success'
        ? 'No supported asset or allowance changes detected. Other changes may still occur.'
        : simulation.status === 'unavailable'
          ? 'Simulation unavailable.'
          : simulation.failure === 'revert'
            ? 'Execution reverted. No changes applied.'
            : 'No remaining asset or allowance changes detected.'
  const effectsNotice = [
    simulation.status === 'error' || simulation.status === 'unavailable' ? simulation.error : undefined,
    waiting ? 'Uses current state. Earlier proposals are not included.' : undefined
  ]
    .filter(Boolean)
    .join(' ')
  const copy = (text: string) => () => {
    void capabilities.external.copy({ text })
  }
  const details = [
    {
      label: 'To',
      value: renderAddress?.(proposal.to) ?? proposal.to,
      onClick: renderAddress ? undefined : copy(proposal.to)
    },
    {
      label: 'Safe',
      value: renderAddress?.(proposal.safe) ?? proposal.safe,
      onClick: renderAddress ? undefined : copy(proposal.safe)
    },
    { label: 'Nonce', value: proposal.nonce },
    { label: 'Current Safe nonce', value: currentNonce },
    { label: 'Native value', value: `${formatUnits(proposal.value, decimals)} ${symbol}` },
    { label: 'Operation', value: proposal.operation === 1 ? 'Delegatecall' : 'Call' },
    { label: 'Safe transaction hash', value: proposal.safeTxHash, onClick: copy(proposal.safeTxHash) },
    {
      label: 'Confirmations collected',
      value: `${proposal.confirmations.length} / ${deployment.configuration.threshold}`
    },
    ...(proposal.integrity?.status === 'mismatch' && proposal.integrity.computedHash
      ? [
          {
            label: 'Locally computed hash',
            value: proposal.integrity.computedHash,
            onClick: copy(proposal.integrity.computedHash)
          }
        ]
      : []),
    ...proposal.confirmations.map((address) => ({
      label: 'Confirmed by',
      value: renderAddress?.(address) ?? address,
      onClick: renderAddress ? undefined : copy(address)
    })),
    ...(proposal.localDecoded
      ? [
          { label: 'Decoded method', value: proposal.localDecoded.method },
          { label: 'ABI source', value: proposal.localDecoded.source },
          ...proposal.localDecoded.parameters.map((parameter) => ({
            label: `${parameter.name} (${parameter.type})`,
            value: parameter.value
          }))
        ]
      : [])
  ]

  return (
    <section aria-label='Request review'>
      <TransactionInformation
        imageCapability={capabilities.external}
        originName='Safe watch-only'
        networkName={networkName}
        networkIcon={networkIcon}
        nativeCurrency={{ symbol }}
        statusLabel={waiting ? 'Waiting for earlier transactions' : 'Pending proposal'}
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
          <Surface padding='medium' tone='raised'>
            <div
              aria-label='Proposal integrity'
              role={proposal.integrity?.status === 'mismatch' ? 'alert' : 'status'}
            >
              <Stack gap='small'>
                <Text
                  variant='sectionTitle'
                  tone={proposal.integrity?.status === 'mismatch' ? 'danger' : 'primary'}
                >
                  {proposal.integrity?.status === 'mismatch' ? 'Integrity mismatch' : 'Transaction integrity'}
                </Text>
                <Text tone={proposal.integrity?.status === 'mismatch' ? 'danger' : 'secondary'}>
                  {proposal.integrity?.reason ??
                    'Unable to verify this cached proposal. Refresh the Safe queue.'}
                </Text>
                <Text variant='supporting'>Hash calculation uses the service-reported Safe version.</Text>
                {proposal.data !== '0x' && !proposal.localDecoded ? (
                  <Text>Unable to decode calldata locally. Inspect the raw bytes below.</Text>
                ) : null}
                {proposal.operation === 1 ? (
                  <Text tone='danger'>Delegatecall runs code with this Safe’s permissions.</Text>
                ) : null}
              </Stack>
            </div>
          </Surface>
        }
        details={details}
        wrapDetailValues
        calldata={{ digest: getCalldataDigest(proposal.data), data: proposal.data }}
      />
    </section>
  )
}
