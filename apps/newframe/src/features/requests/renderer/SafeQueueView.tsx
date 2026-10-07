import { Button } from '@newframe/ui/button'
import { Icon } from '@newframe/ui/icon'
import { Stack } from '@newframe/ui/stack'
import { Text } from '@newframe/ui/text'
import { formatUnits } from 'ethers'
import type { ReactNode } from 'react'

import { AddressText } from '../../../shared/renderer/ui/AddressText.tsx'
import type { SafeDeployment } from '../../accounts/domain/safe.ts'
import { RequestCard } from './ui/RequestCard.tsx'
import { RequestList } from './ui/RequestList.tsx'

export function SafeQueueView({
  deployments,
  chainNames,
  chainIcons,
  currencies = {},
  refreshing,
  refreshError,
  onRefresh,
  onSelect
}: {
  deployments: SafeDeployment[]
  chainNames: Record<number, string>
  chainIcons?: Record<number, ReactNode>
  currencies?: Partial<Record<number, { symbol: string; decimals: number }>>
  refreshing: boolean
  refreshError?: string
  onRefresh: () => void
  onSelect: (chainId: number, hash: string) => void
}) {
  const failedDeployments = deployments.filter((deployment) => deployment.error)
  const hasQueueError = failedDeployments.length > 0 || !!refreshError
  const mostRecentRefresh = deployments.reduce(
    (latest, deployment) => Math.max(latest, deployment.refreshedAt ?? 0),
    0
  )
  const groups = deployments
    .filter((deployment) => deployment.pending?.length)
    .map((deployment) => ({
      id: String(deployment.chainId),
      title: chainNames[deployment.chainId] || `Chain ${deployment.chainId}`,
      icon: chainIcons?.[deployment.chainId],
      items: [...deployment.pending!]
        .sort((a, b) => {
          if (BigInt(a.nonce) < BigInt(b.nonce)) {
            return -1
          }
          if (BigInt(a.nonce) > BigInt(b.nonce)) {
            return 1
          }
          return 0
        })
        .map((proposal) => {
          const mismatch = proposal.integrity?.status === 'mismatch'
          const currency = currencies[deployment.chainId]
          const method = proposal.localDecoded?.method
          let title = 'Transfer'
          if (proposal.batch) {
            title = 'Batch'
          } else if (method !== undefined) {
            title = method
          } else if (proposal.operation === 1) {
            title = 'Delegatecall'
          } else if (proposal.data !== '0x') {
            title = 'Contract call'
          }
          let description = 'Transaction'
          if (proposal.batch) {
            description = `${proposal.batch.length} ${proposal.batch.length === 1 ? 'action' : 'actions'}`
          } else if (method) {
            description = proposal.localDecoded?.contractName ?? 'Contract interaction'
          } else if (proposal.data === '0x' && currency) {
            description = `${formatUnits(proposal.value, currency.decimals)} ${currency.symbol}`
          }
          return (
            <RequestCard
              key={proposal.safeTxHash}
              title={title}
              icon={<Icon name='safe' size='medium' />}
              status={mismatch ? 'Needs review' : 'Pending'}
              tone={mismatch ? 'danger' : 'accent'}
              state={mismatch ? 'failed' : 'pending'}
              label={`Open Safe proposal ${proposal.safeTxHash} on chain ${deployment.chainId}`}
              onOpen={() => onSelect(deployment.chainId, proposal.safeTxHash)}
            >
              <Text tone='secondary' variant='supporting'>
                {description}
                {proposal.batch ? null : (
                  <>
                    {' · '}
                    <AddressText address={proposal.to} />
                  </>
                )}
              </Text>
            </RequestCard>
          )
        })
    }))
  const hasUnknownQueue = deployments.some(
    (deployment) => deployment.pending === undefined && !deployment.error
  )
  let emptyText = 'No pending requests'
  if (hasQueueError) {
    emptyText = 'Pending requests unavailable'
  } else if (refreshing || hasUnknownQueue) {
    emptyText = 'Checking for pending requests'
  }

  return (
    <section aria-label='Account requests'>
      <Stack gap='small'>
        <Button label='Refresh requests' onPress={onRefresh} disabled={refreshing}>
          Refresh requests
        </Button>
        {hasQueueError ? (
          <div role='alert'>
            <Stack gap='xsmall'>
              <Text tone='danger'>Some Safe requests could not be refreshed.</Text>
              {mostRecentRefresh ? (
                <Text tone='secondary' variant='caption'>
                  Most recent successful refresh: {new Date(mostRecentRefresh).toLocaleString()}
                </Text>
              ) : null}
            </Stack>
          </div>
        ) : null}
        <RequestList groups={groups} emptyText={emptyText} />
      </Stack>
    </section>
  )
}
