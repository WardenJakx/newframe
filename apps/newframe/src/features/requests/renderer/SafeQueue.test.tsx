import { expect, it } from 'bun:test'
import { act } from '@testing-library/react'
import { render, screen } from '../../../../test/support/componentSetup'
import { registerTestRuntimeFixture } from '../../../../test/support/rendererClient'
import { walletState } from '../../../platform/state-sync/renderer/fixtures.test-support'
import type { SafeDeployment } from '../../accounts/domain/safe'
import { SafeQueueView } from './SafeQueueView'
import { RequestsOverlay } from './RequestsOverlay'
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
it('refreshes cached proposals, distinguishes same-nonce hashes, and removes vanished details', async () => {
  fixture.state.reset(state())
  const capabilities = createCapabilityFake()
  const { user } = render(<RequestsOverlay capabilities={capabilities} onBack={() => {}} />)
  expect(screen.getByText('Service unavailable')).toBeTruthy()
  expect(screen.getAllByRole('button', { name: /^Open Safe proposal/ })).toHaveLength(2)
  expect(screen.queryByText('Approval threshold')).toBeNull()
  expect(screen.queryByText('Safe version')).toBeNull()
  expect(screen.queryByText(hash)).toBeNull()
  await user.click(screen.getByRole('button', { name: 'Refresh requests' }))
  expect(capabilities.safe.refresh).toHaveBeenLastCalledWith({ accountId: address, force: true })
  await user.click(screen.getByRole('button', { name: `Open Safe proposal ${hash} on chain 1` }))
  expect(screen.getByText('Simulation not available for Safe proposals yet.')).toBeTruthy()
  expect(screen.getByText('Waiting for earlier transactions')).toBeTruthy()
  expect(screen.getByText('Delegatecall')).toBeTruthy()
  expect(screen.getByText('1.0 native')).toBeTruthy()
  expect(screen.getByText('Approval threshold')).toBeTruthy()
  expect(screen.getByText('Safe version')).toBeTruthy()
  expect(screen.getByText('Owner')).toBeTruthy()
  expect(screen.getAllByRole('button', { name: /^Back/ })).toHaveLength(1)
  expect(screen.queryByText('Safe proposal')).toBeNull()
  await user.click(screen.getByRole('button', { name: 'Back to requests' }))
  expect(screen.queryByLabelText('Request review')).toBeNull()
  await user.click(screen.getByRole('button', { name: `Open Safe proposal ${hash} on chain 1` }))
  await user.click(screen.getByRole('button', { name: /Show full calldata/ }))
  expect(screen.getByText('0x1234')).toBeTruthy()
  expect(screen.queryByText('Estimated changes')).toBeNull()
  expect(screen.queryByRole('button', { name: /approve|sign|execute|reject/i })).toBeNull()
  await act(async () => fixture.state.reset(state({ ...deployment, pending: [] })))
  expect(screen.queryByLabelText('Request review')).toBeNull()
  expect(screen.getByText('No pending requests')).toBeTruthy()
})

it('does not report an empty queue before proposals have loaded', async () => {
  fixture.state.reset(state({ ...deployment, pending: undefined }))
  const capabilities = createCapabilityFake()
  render(<RequestsOverlay capabilities={capabilities} onBack={() => {}} />)
  expect(screen.getByText('Loading requests')).toBeTruthy()
  expect(screen.getByText('Service unavailable')).toBeTruthy()
  expect(screen.queryByText('No pending requests')).toBeNull()
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
