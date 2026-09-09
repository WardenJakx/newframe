import type { ReactNode } from 'react'
import { formatUnits } from 'ethers'
import { Button } from '@newframe/ui/button'
import { Icon } from '@newframe/ui/icon'
import { Stack } from '@newframe/ui/stack'
import { Text } from '@newframe/ui/text'
import { RequestCard } from './ui/RequestCard'
import { RequestList } from './ui/RequestList'
import { shortAddress } from '../../../shared/renderer/ui/AddressIdentity'
import type { SafeDeployment } from '../../accounts/domain/safe'

export function SafeQueueView({
  deployments,
  networkNames,
  networkIcons,
  currencies = {},
  refreshing,
  refreshError,
  onRefresh,
  onSelect
}: {
  deployments: SafeDeployment[]
  networkNames: Record<number, string>
  networkIcons?: Record<number, ReactNode>
  currencies?: Record<number, { symbol: string; decimals: number }>
  refreshing: boolean
  refreshError?: string
  onRefresh: () => void
  onSelect: (chainId: number, hash: string) => void
}) {
  return (
    <section aria-label='Account requests'>
      <Stack gap='small'>
        <Button label='Refresh requests' onPress={onRefresh} disabled={refreshing}>
          Refresh requests
        </Button>
        {refreshError ? (
          <div role='alert'>
            <Text tone='danger'>{refreshError}</Text>
          </div>
        ) : null}
        <RequestList
          groups={deployments.map((deployment) => ({
            id: String(deployment.chainId),
            title: networkNames[deployment.chainId] || `Chain ${deployment.chainId}`,
            icon: networkIcons?.[deployment.chainId],
            notice: deployment.error ? (
              <div role='alert'>
                <Text tone='danger'>{deployment.error}</Text>
              </div>
            ) : undefined,
            emptyText: deployment.pending === undefined ? 'Loading requests' : 'No pending requests',
            items: [...(deployment.pending ?? [])]
              .sort((a, b) =>
                BigInt(a.nonce) < BigInt(b.nonce) ? -1 : BigInt(a.nonce) > BigInt(b.nonce) ? 1 : 0
              )
              .map((proposal) => {
                const mismatch = proposal.integrity?.status === 'mismatch'
                const currency = currencies[deployment.chainId]
                return (
                  <RequestCard
                    key={proposal.safeTxHash}
                    title={
                      proposal.operation === 1
                        ? 'Delegatecall'
                        : proposal.data !== '0x'
                          ? 'Contract call'
                          : 'Transfer'
                    }
                    icon={<Icon name={proposal.data === '0x' ? 'arrowRight' : 'ethereum'} size='medium' />}
                    status={mismatch ? 'Needs review' : 'Pending'}
                    tone={mismatch ? 'danger' : 'accent'}
                    state={mismatch ? 'failed' : 'pending'}
                    label={`Open Safe proposal ${proposal.safeTxHash} on chain ${deployment.chainId}`}
                    onOpen={() => onSelect(deployment.chainId, proposal.safeTxHash)}
                  >
                    <Text tone='secondary' variant='supporting'>
                      {proposal.localDecoded?.method ??
                        (proposal.data === '0x' && currency
                          ? `${formatUnits(proposal.value, currency.decimals)} ${currency.symbol}`
                          : 'Transaction')}{' '}
                      · {shortAddress(proposal.to)}
                    </Text>
                  </RequestCard>
                )
              })
          }))}
        />
      </Stack>
    </section>
  )
}
