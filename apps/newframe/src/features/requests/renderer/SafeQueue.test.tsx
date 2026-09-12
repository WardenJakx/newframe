import { expect, it } from 'bun:test'
import { act, within } from '@testing-library/react'
import { render, screen } from '../../../../test/support/componentSetup'
import { registerTestRuntimeFixture } from '../../../../test/support/rendererClient'
import { walletState } from '../../../platform/state-sync/renderer/fixtures.test-support'
import type { SafeDeployment, SafeProposalSimulation } from '../../accounts/domain/safe'
import { SafeQueueView } from './SafeQueueView'
import { RequestsOverlay } from './RequestsOverlay'
import { SafeProposalDetailsView } from './SafeProposalDetailsView'
import { createRequestRendererCapabilitiesFake as createCapabilityFake } from './requestCapabilities.test-support'

const fixture = registerTestRuntimeFixture()
const address = '0x1111111111111111111111111111111111111111'
const hash = `0x${'a'.repeat(64)}`
const competingHash = `0x${'b'.repeat(64)}`
const deployment: SafeDeployment = {
  chainId: 1,
  address,
  configuration: { owners: [address], threshold: 1, nonce: '2', version: '1.4.1' },
  refreshedAt: 0,
  error: 'Service unavailable',
  pending: [hash, competingHash].map((safeTxHash) => ({
    safeTxHash,
    safe: address,
    nonce: '3',
    to: address,
    value: '1000000000000000000',
    operation: 1,
    data: '0x1234',
    confirmations: [address]
  }))
}
function state(safe = deployment) {
  return walletState({
    currentAccount: address,
    accounts: {
      [address]: {
        id: address,
        address,
        profileId: 'default-profile',
        name: 'Safe',
        lastSignerType: 'address',
        status: 'ok',
        signer: 'watch',
        requests: {},
        created: '',
        safe: { '1': safe }
      }
    }
  })
}

function deferredPreview() {
  let resolve!: (result: SafeProposalSimulation) => void
  const promise = new Promise<SafeProposalSimulation>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}

const previewContext = {
  currentNonce: '2',
  blockNumber: '100',
  assumptions: ['Owner authorization and guard checks are bypassed for this preview.']
}
const previewEffect = {
  id: 'safe-native',
  kind: 'native' as const,
  direction: 'out' as const,
  label: 'Asset out',
  amount: '0x1',
  decimals: 18,
  symbol: 'ETH'
}
const success = (label = 'Asset out'): SafeProposalSimulation => ({
  status: 'success',
  effects: [{ ...previewEffect, label }],
  ...previewContext
})

it('loads simulated effects into Estimated changes without owner confirmations', async () => {
  const safe = {
    ...deployment,
    configuration: { ...deployment.configuration, owners: [address, `0x${'2'.repeat(40)}`], threshold: 2 },
    pending: deployment.pending!.map((proposal) => ({ ...proposal, confirmations: [] }))
  }
  fixture.state.reset(state(safe))
  const pending = deferredPreview()
  const capabilities = createCapabilityFake()
  capabilities.safe.simulate.mockReturnValueOnce(pending.promise)
  const { user } = render(<RequestsOverlay capabilities={capabilities} onBack={() => {}} />)
  await user.click(screen.getByRole('button', { name: `Open Safe proposal ${hash} on chain 1` }))
  expect(screen.getByLabelText('Transaction effects').textContent).toContain('Simulating…')
  expect(capabilities.safe.simulate).toHaveBeenCalledWith({
    accountId: address,
    chainId: 1,
    safeTxHash: hash
  })
  await act(async () =>
    pending.resolve({
      status: 'success',
      ...previewContext,
      effects: [
        previewEffect,
        {
          ...previewEffect,
          id: 'safe-token',
          kind: 'erc20',
          direction: 'in',
          label: 'Token received',
          symbol: 'USDC',
          decimals: 6
        },
        {
          ...previewEffect,
          id: 'safe-allowance',
          kind: 'allowance',
          direction: 'neutral',
          label: 'Allowance change'
        }
      ]
    })
  )
  const effects = within(screen.getByLabelText('Transaction effects'))
  expect(effects.getByLabelText('Outgoing asset effect')).toBeTruthy()
  expect(effects.getByLabelText('Incoming asset effect')).toBeTruthy()
  expect(effects.getByLabelText('Neutral asset effect')).toBeTruthy()
  expect(screen.getByText('Waiting for earlier transactions')).toBeTruthy()
  expect(effects.getByText('Uses current state. Earlier proposals are not included.')).toBeTruthy()
})

it.each([
  { status: 'success', effects: [], ...previewContext, currentNonce: '3' },
  { status: 'unavailable', error: 'Provider cannot trace this call.' },
  {
    status: 'error',
    failure: 'revert',
    error: 'Safe execution reverted.',
    effects: [previewEffect],
    ...previewContext
  },
  {
    status: 'error',
    failure: 'inner',
    error: 'Proposed call reverted.',
    effects: [previewEffect],
    ...previewContext
  }
] satisfies SafeProposalSimulation[])(
  'renders $status simulation results in Estimated changes',
  (simulation) => {
    render(
      <SafeProposalDetailsView
        deployment={deployment}
        proposal={deployment.pending![0]!}
        simulation={simulation}
        networkName='Ethereum'
        symbol='ETH'
        capabilities={createCapabilityFake()}
      />
    )
    const effects = within(screen.getByLabelText('Transaction effects'))
    if (simulation.status === 'success') {
      expect(
        effects.getByText('No supported asset or allowance changes detected. Other changes may still occur.')
      ).toBeTruthy()
      expect(screen.getByText('Pending proposal')).toBeTruthy()
      expect(screen.queryByText('Waiting for earlier transactions')).toBeNull()
      expect(effects.queryByText(/Earlier proposals/)).toBeNull()
    } else {
      expect(effects.getByText(simulation.error, { exact: false })).toBeTruthy()
      expect(effects.queryByLabelText('Outgoing asset effect') !== null).toBe(
        simulation.status === 'error' && simulation.failure === 'inner'
      )
      if (simulation.status === 'unavailable')
        expect(effects.getByText('Simulation unavailable.')).toBeTruthy()
      if (simulation.status === 'error' && simulation.failure === 'revert')
        expect(effects.getByText('Execution reverted. No changes applied.')).toBeTruthy()
    }
  }
)

it('discards replies after selecting another proposal and returning to the first', async () => {
  fixture.state.reset(state())
  const first = deferredPreview(),
    second = deferredPreview(),
    returned = deferredPreview()
  const capabilities = createCapabilityFake()
  capabilities.safe.simulate
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise)
    .mockReturnValueOnce(returned.promise)
  const { user } = render(<RequestsOverlay capabilities={capabilities} onBack={() => {}} />)
  const open = async (proposalHash: string) =>
    user.click(screen.getByRole('button', { name: `Open Safe proposal ${proposalHash} on chain 1` }))
  await open(hash)
  await user.click(screen.getByRole('button', { name: 'Back to requests' }))
  await open(competingHash)
  await user.click(screen.getByRole('button', { name: 'Back to requests' }))
  await open(hash)
  await act(async () => {
    first.resolve(success('Old first'))
    second.resolve(success('Old second'))
  })
  expect(screen.queryByText('Old first')).toBeNull()
  expect(screen.queryByText('Old second')).toBeNull()
  expect(screen.getByLabelText('Transaction effects').textContent).toContain('Simulating…')
  await act(async () => returned.resolve(success('Current preview')))
  expect(screen.getByText('Current preview')).toBeTruthy()
})

it('invalidates signed fields and configuration, while ignoring equivalent projections and confirmations', async () => {
  fixture.state.reset(state())
  const first = deferredPreview(),
    changed = deferredPreview(),
    configured = deferredPreview(),
    restored = deferredPreview()
  const capabilities = createCapabilityFake()
  capabilities.safe.simulate
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(changed.promise)
    .mockReturnValueOnce(configured.promise)
    .mockReturnValueOnce(restored.promise)
  const { user } = render(<RequestsOverlay capabilities={capabilities} onBack={() => {}} />)
  await user.click(screen.getByRole('button', { name: `Open Safe proposal ${hash} on chain 1` }))
  const confirmed = structuredClone(deployment)
  confirmed.pending![0]!.confirmations = []
  await act(async () => fixture.state.reset(state(confirmed)))
  expect(capabilities.safe.simulate).toHaveBeenCalledTimes(1)
  const changedProposal = {
    ...confirmed,
    pending: confirmed.pending!.map((proposal) => ({ ...proposal, value: '2' }))
  }
  await act(async () => fixture.state.reset(state(changedProposal)))
  await act(async () => first.resolve(success('Old fields')))
  expect(screen.queryByText('Old fields')).toBeNull()
  const changedConfig = {
    ...changedProposal,
    configuration: { ...changedProposal.configuration, nonce: '3' }
  }
  await act(async () => fixture.state.reset(state(changedConfig)))
  await act(async () => changed.resolve(success('Old configuration')))
  expect(screen.queryByText('Old configuration')).toBeNull()
  await act(async () => configured.resolve(success('Configured preview')))
  expect(screen.getByText('Configured preview')).toBeTruthy()
  await act(async () => fixture.state.reset(state(changedProposal)))
  expect(screen.queryByText('Configured preview')).toBeNull()
  expect(screen.getByLabelText('Transaction effects').textContent).toContain('Simulating…')
  await act(async () => restored.resolve(success('Restored preview')))
  expect(screen.getByText('Restored preview')).toBeTruthy()
})

it.each(['account', 'profile'] as const)('discards previews after %s lifecycle changes', async (change) => {
  fixture.state.reset(state())
  const first = deferredPreview(),
    restored = deferredPreview()
  const capabilities = createCapabilityFake()
  capabilities.safe.simulate.mockReturnValueOnce(first.promise).mockReturnValueOnce(restored.promise)
  const { user } = render(<RequestsOverlay capabilities={capabilities} onBack={() => {}} />)
  await user.click(screen.getByRole('button', { name: `Open Safe proposal ${hash} on chain 1` }))
  const next = state()
  if (change === 'account') next.currentAccount = ''
  if (change === 'profile') {
    next.currentProfile = 'other-profile'
  }
  await act(async () => fixture.state.reset(next))
  await act(async () => fixture.state.reset(state()))
  await user.click(screen.getByRole('button', { name: `Open Safe proposal ${hash} on chain 1` }))
  await act(async () => first.resolve(success('Previous lifetime')))
  expect(screen.queryByText('Previous lifetime')).toBeNull()
  await act(async () => restored.resolve(success('New lifetime')))
  expect(screen.getByText('New lifetime')).toBeTruthy()
})
it('refreshes cached proposals, distinguishes same-nonce hashes, and removes vanished details', async () => {
  fixture.state.reset(state())
  const capabilities = createCapabilityFake()
  const { user } = render(<RequestsOverlay capabilities={capabilities} onBack={() => {}} />)
  expect(screen.getByText('Some Safe requests could not be refreshed.')).toBeTruthy()
  expect(screen.queryByText('Service unavailable')).toBeNull()
  expect(screen.getAllByRole('button', { name: /^Open Safe proposal/ })).toHaveLength(2)
  expect(screen.queryByText('Approval threshold')).toBeNull()
  expect(screen.queryByText('Safe version')).toBeNull()
  expect(screen.queryByText(hash)).toBeNull()
  await user.click(screen.getByRole('button', { name: 'Refresh requests' }))
  expect(capabilities.safe.refresh).toHaveBeenLastCalledWith({ accountId: address, force: true })
  await user.click(screen.getByRole('button', { name: `Open Safe proposal ${hash} on chain 1` }))
  expect(screen.getByText('Waiting for earlier transactions')).toBeTruthy()
  expect(screen.getByText('Delegatecall')).toBeTruthy()
  expect(screen.getByText('1.0 native')).toBeTruthy()
  expect(screen.getByLabelText('Transaction effects').textContent).toContain('Simulation unavailable.')
  expect(screen.queryByText('Approval threshold')).toBeNull()
  expect(screen.queryByText('Safe version')).toBeNull()
  expect(screen.queryByText('Owner')).toBeNull()
  expect(screen.queryByText('Last refreshed')).toBeNull()
  expect(screen.queryByText('Network')).toBeNull()
  expect(screen.getByLabelText('Transaction details').textContent?.startsWith('Request detailsTo')).toBe(true)
  expect(screen.getAllByRole('button', { name: /^Back/ })).toHaveLength(1)
  expect(screen.queryByText('Safe proposal')).toBeNull()
  await user.click(screen.getByRole('button', { name: 'Back to requests' }))
  expect(screen.queryByLabelText('Request review')).toBeNull()
  await user.click(screen.getByRole('button', { name: `Open Safe proposal ${hash} on chain 1` }))
  await user.click(screen.getByRole('button', { name: /Show full calldata/ }))
  expect(screen.getByText('0x1234')).toBeTruthy()
  expect(screen.getByText('Estimated changes')).toBeTruthy()
  expect(screen.queryByRole('button', { name: /approve|sign|execute|reject/i })).toBeNull()
  await act(async () => fixture.state.reset(state({ ...deployment, pending: [] })))
  expect(screen.queryByLabelText('Request review')).toBeNull()
  expect(screen.getByText('Pending requests unavailable')).toBeTruthy()
  expect(screen.queryByText('Ethereum')).toBeNull()
})

it('does not report an empty queue before proposals have loaded', async () => {
  fixture.state.reset(state({ ...deployment, pending: undefined }))
  const capabilities = createCapabilityFake()
  render(<RequestsOverlay capabilities={capabilities} onBack={() => {}} />)
  expect(await screen.findByText('Pending requests unavailable')).toBeTruthy()
  expect(screen.getByText('Some Safe requests could not be refreshed.')).toBeTruthy()
  expect(screen.queryByText('Loading requests')).toBeNull()
  expect(screen.queryByText('No pending requests')).toBeNull()
  expect(screen.queryByText('Ethereum')).toBeNull()
})

it('omits unknown chain groups without claiming the queue is empty', () => {
  render(
    <SafeQueueView
      deployments={[{ ...deployment, pending: undefined, error: undefined }]}
      networkNames={{ 1: 'Ethereum' }}
      refreshing={false}
      onRefresh={() => {}}
      onSelect={() => {}}
    />
  )

  expect(screen.getByText('Checking for pending requests')).toBeTruthy()
  expect(screen.queryByText('No pending requests')).toBeNull()
  expect(screen.queryByText('Ethereum')).toBeNull()
})

it('omits the ordinary empty request list for a Safe and preserves it for ordinary accounts', async () => {
  fixture.state.reset(state())
  const capabilities = createCapabilityFake()
  render(<RequestsOverlay capabilities={capabilities} onBack={() => {}} />)
  expect(screen.getByLabelText('Account requests')).toBeTruthy()
  expect(screen.queryByText('No pending requests')).toBeNull()
  const ordinary = state()
  delete ordinary.accounts[address].safe
  act(() => fixture.state.reset(ordinary))
  expect(screen.getByText('No pending requests')).toBeTruthy()
})

it('orders proposals by nonce while preserving alternatives and the snapshot', () => {
  const pending = [
    { ...deployment.pending![0], nonce: '9007199254740993' },
    { ...deployment.pending![0], safeTxHash: '0x' + 'c'.repeat(64), nonce: '2' },
    { ...deployment.pending![1], nonce: '9007199254740993' }
  ]
  render(
    <SafeQueueView
      deployments={[{ ...deployment, pending }]}
      networkNames={{ 1: 'Ethereum' }}
      refreshing={false}
      onRefresh={() => {}}
      onSelect={() => {}}
    />
  )
  expect(
    screen
      .getAllByRole('button', { name: /^Open Safe proposal/ })
      .map((button) => button.getAttribute('aria-label'))
  ).toEqual([
    `Open Safe proposal ${pending[1].safeTxHash} on chain 1`,
    `Open Safe proposal ${pending[0].safeTxHash} on chain 1`,
    `Open Safe proposal ${pending[2].safeTxHash} on chain 1`
  ])
  expect(pending.map((proposal) => proposal.nonce)).toEqual(['9007199254740993', '2', '9007199254740993'])
})

it('groups pending proposals by chain and omits chains without proposals', () => {
  const refreshedAt = Date.UTC(2026, 8, 9, 12)
  render(
    <SafeQueueView
      deployments={[
        { ...deployment, error: undefined, refreshedAt, pending: [deployment.pending![0]] },
        { ...deployment, chainId: 10, pending: [] },
        { ...deployment, chainId: 137, pending: undefined, error: undefined },
        { ...deployment, chainId: 8453, pending: [], refreshedAt, error: 'Rate limited' }
      ]}
      networkNames={{ 1: 'Ethereum', 10: 'Optimism', 137: 'Polygon', 8453: 'Base' }}
      refreshing={false}
      onRefresh={() => {}}
      onSelect={() => {}}
    />
  )

  expect(screen.getByText('Ethereum')).toBeTruthy()
  expect(screen.queryByText('Optimism')).toBeNull()
  expect(screen.queryByText('Polygon')).toBeNull()
  expect(screen.queryByText('Base')).toBeNull()
  expect(screen.getAllByRole('alert')).toHaveLength(1)
  expect(screen.getByText(/Most recent successful refresh:/)).toBeTruthy()
})

it('shows a prominent mismatch, local interpretation and the shared calldata digest', async () => {
  fixture.state.reset(
    state({
      ...deployment,
      error: undefined,
      pending: [
        {
          ...deployment.pending![0],
          integrity: {
            status: 'mismatch',
            reason: 'The service description does not match the calldata.',
            computedHash: competingHash
          },
          dataDecoded: { method: 'forged', parameters: [] },
          localDecoded: { method: 'transfer', parameters: [], source: 'Local function selector' }
        }
      ]
    })
  )
  const capabilities = createCapabilityFake()
  const { user } = render(<RequestsOverlay capabilities={capabilities} onBack={() => {}} />)
  expect(screen.queryByText('forged')).toBeNull()
  expect(screen.getByText('transfer')).toBeTruthy()
  expect(screen.getByText(/Contract interaction/)).toBeTruthy()
  await user.click(screen.getByRole('button', { name: `Open Safe proposal ${hash} on chain 1` }))
  expect(screen.getByRole('alert', { name: 'Proposal integrity' }).textContent).toContain(
    'Integrity mismatch'
  )
  expect(screen.getByText('Locally computed hash')).toBeTruthy()
  expect(screen.getByText('transfer')).toBeTruthy()
  expect(screen.getByText('Local function selector')).toBeTruthy()
  expect(screen.queryByText('forged')).toBeNull()
  const { getCalldataDigest } = await import('../../../shared/domain/calldata')
  expect(screen.getByText(getCalldataDigest('0x1234'))).toBeTruthy()
})

it('keeps RPC and Safe requests together and routes the single back button through review', async () => {
  const { WalletRequestSchema } = await import('../../../platform/state-sync/contract/projections')
  const mixed = state({ ...deployment, error: undefined })
  mixed.accounts[address].requests.access = WalletRequestSchema.parse({
    type: 'access',
    handlerId: 'access',
    account: address,
    origin: 'https://example.test',
    payload: { id: 1, jsonrpc: '2.0', method: 'eth_accounts', params: [] }
  })
  fixture.state.reset(mixed)
  let opened = ''
  let closed = false
  const capabilities = createCapabilityFake()
  const { user } = render(
    <RequestsOverlay
      capabilities={{
        ...capabilities,
        panel: {
          ...capabilities.panel,
          openRequest: async ({ requestId }) => {
            opened = requestId
            return { ok: true }
          }
        }
      }}
      onBack={() => {
        closed = true
      }}
    />
  )
  await user.click(screen.getByRole('button', { name: 'Open Account Access' }))
  expect(opened).toBe('access')
  await user.click(screen.getByRole('button', { name: `Open Safe proposal ${hash} on chain 1` }))
  expect(screen.queryByRole('button', { name: 'Open Account Access' })).toBeNull()
  expect(screen.getAllByRole('dialog')).toHaveLength(1)
  await user.click(screen.getByRole('button', { name: 'Back to requests' }))
  expect(closed).toBe(false)
  expect(screen.getByRole('button', { name: 'Open Account Access' })).toBeTruthy()
  expect(screen.getAllByRole('button', { name: /^Open Safe proposal/ })).toHaveLength(2)
  await user.click(screen.getByRole('button', { name: 'Back' }))
  expect(closed).toBe(true)
})
