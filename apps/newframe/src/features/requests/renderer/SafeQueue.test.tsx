import { expect, it } from 'bun:test'

import { act, within } from '@testing-library/react'

import { render, screen } from '../../../../test/support/componentSetup'
import { registerTestRuntimeFixture } from '../../../../test/support/rendererClient'
import { walletState } from '../../../platform/state-sync/renderer/fixtures.test-support'
import type { SafeDeployment, SafeOwnerAccount, SafeProposalSimulation } from '../../accounts/domain/safe'
import { createRequestRendererCapabilitiesFake as createCapabilityFake } from './requestCapabilities.test-support'
import { RequestsOverlay } from './RequestsOverlay'
import { SafeProposalDetailsView } from './SafeProposalDetailsView'
import { SafeQueueView } from './SafeQueueView'

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
    confirmations: []
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

const ownerAccount = (accountId: string, overrides: Partial<SafeOwnerAccount> = {}): SafeOwnerAccount => ({
  accountId,
  name: accountId,
  address: `0x${'2'.repeat(40)}`,
  created: 'owner:1',
  signerType: 'seed',
  signerAttached: true,
  signerStatus: 'ok',
  status: 'ready',
  ...overrides
})

function stateWithOwners(owners: SafeOwnerAccount[]) {
  const next = state()
  next.accounts[address].safeOwners = { '1': owners.map((owner) => ({ ...owner })) }
  for (const owner of owners) {
    next.accounts[owner.accountId] = {
      id: owner.accountId,
      address: owner.address,
      name: owner.name,
      profileId: next.currentProfile,
      created: owner.created,
      signer: `${owner.accountId}-signer`,
      lastSignerType: owner.signerType,
      status: 'ok',
      requests: {}
    }
  }
  return next
}

function expectSafeSubmissionDisabled(primary = 'Sign') {
  for (const name of [primary, 'Decline']) {
    expect(screen.getByRole('button', { name }).hasAttribute('disabled')).toBe(true)
  }
}

it('selects disconnected owners in bottom controls and preserves Safe identity and simulation', async () => {
  const hot = ownerAccount('Hot owner')
  const hardware = ownerAccount('Ledger owner', {
    signerType: 'ledger',
    signerAttached: false,
    signerStatus: 'disconnected',
    status: 'unavailable'
  })
  const initial = stateWithOwners([hot, hardware])
  fixture.state.reset(initial)
  const capabilities = createCapabilityFake()
  const pending = deferredPreview()
  capabilities.safe.simulate.mockReturnValueOnce(pending.promise)
  const { user } = render(<RequestsOverlay capabilities={capabilities} onBack={() => {}} />)
  await user.click(screen.getByRole('button', { name: `Open Safe proposal ${hash} on chain 1` }))
  expect(screen.getByRole('button', { name: 'Signer' }).textContent).toContain('Choose an account')
  expect(screen.getByText('Signer')).toBeTruthy()
  expect(screen.queryByText('Owner account')).toBeNull()
  const details = screen.getByLabelText('Transaction details')
  const chooser = screen.getByRole('button', { name: 'Signer' })
  const account = screen.getByText('Account')
  expect(details.compareDocumentPosition(account) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(account.compareDocumentPosition(chooser) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(details.compareDocumentPosition(chooser) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(
    chooser.compareDocumentPosition(screen.getByRole('button', { name: 'Sign' })) &
      Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy()
  expectSafeSubmissionDisabled()
  const connected = { ...hardware, signerAttached: true, signerStatus: 'ok', status: 'ready' as const }
  await user.click(screen.getByRole('button', { name: 'Signer' }))
  expect(within(screen.getByRole('option', { name: /Hot owner/ })).getByText('Hot Signer')).toBeTruthy()
  await user.click(screen.getByRole('option', { name: /Ledger owner/ }))
  expect(screen.getByRole('button', { name: 'Signer' }).textContent).toContain('Ledger owner')
  const selectedState = fixture.state.wallet.getState()
  expect(selectedState.currentAccount).toBe(address)
  expect(selectedState.accounts[address].address).toBe(address)
  expect(selectedState.accounts[address].signer).toBe('watch')
  expect(selectedState.accounts[hot.accountId].signer).toBe('Hot owner-signer')
  expectSafeSubmissionDisabled('No signer attached')
  expect(screen.getByRole('button', { name: 'Signer' }).textContent).toContain('Ledger owner')
  await user.click(screen.getByRole('button', { name: 'Signer' }))
  expect(screen.getByText('Ledger · disconnected')).toBeTruthy()
  await act(async () => fixture.state.reset(stateWithOwners([hot, connected])))
  expect(screen.getByRole('button', { name: 'Signer' }).textContent).toContain('Ledger owner')
  const locked = stateWithOwners(
    [hot, connected].map((owner) => ({ ...owner, status: 'unavailable', signerStatus: 'Wallet locked' }))
  )
  locked.appLock = { ...locked.appLock, locked: true }
  await act(async () => fixture.state.reset(locked))
  expect(screen.getByText('Ledger · Wallet locked')).toBeTruthy()
  expect(screen.queryByText(/Connected and ready to sign/)).toBeNull()
  await user.click(screen.getByRole('button', { name: 'Signer' }))
  expectSafeSubmissionDisabled()
  const detached = stateWithOwners(
    [hot, connected].map((owner) => ({
      ...owner,
      signerAttached: false,
      signerStatus: 'Signer unavailable',
      status: 'unavailable'
    }))
  )
  await act(async () => fixture.state.reset(detached))
  expect(screen.getByRole('button', { name: 'Signer' }).textContent).toContain('Ledger owner')
  expect(screen.getByRole('button', { name: 'Signer' }).hasAttribute('disabled')).toBe(false)
  expectSafeSubmissionDisabled('No signer attached')
  await act(async () => fixture.state.reset(locked))
  expect(screen.getByRole('button', { name: 'Signer' }).textContent).toContain('Ledger owner')
  await act(async () => pending.resolve(success('Owner-independent preview')))
  expect(screen.getByText('Owner-independent preview')).toBeTruthy()
  expectSafeSubmissionDisabled()
})

it('allows locked and disconnected owners while keeping watch-only owners disabled', async () => {
  const owners = [
    ownerAccount('First owner'),
    ownerAccount('Second owner'),
    ownerAccount('Locked owner', { status: 'unavailable', signerStatus: 'locked' }),
    ownerAccount('Detached owner', {
      signerAttached: false,
      status: 'unavailable',
      signerStatus: 'Signer unavailable'
    }),
    ownerAccount('Watch owner', {
      status: 'watch-only',
      signerType: 'address',
      signerAttached: false,
      signerStatus: 'Watch-only account'
    })
  ]
  fixture.state.reset(stateWithOwners(owners))
  const { user } = render(<RequestsOverlay capabilities={createCapabilityFake()} onBack={() => {}} />)
  await user.click(screen.getByRole('button', { name: `Open Safe proposal ${hash} on chain 1` }))
  expect(screen.getByRole('button', { name: 'Signer' }).textContent).toContain('Choose an account')
  await user.click(screen.getByRole('button', { name: 'Signer' }))
  const locked = screen.getByRole('option', { name: /Locked owner/ })
  expect(locked.hasAttribute('disabled')).toBe(false)
  expect(screen.getByRole('option', { name: /Detached owner/ }).hasAttribute('disabled')).toBe(false)
  expect(screen.getByRole('option', { name: /Watch owner/ }).hasAttribute('disabled')).toBe(true)
  await user.click(screen.getByRole('option', { name: /Watch owner/ }))
  expect(screen.getByRole('button', { name: 'Signer' }).textContent).toContain('Choose an account')
  expect(within(locked).getByText('Hot Signer · Unlock your Hot Signer')).toBeTruthy()
  await user.click(locked)
  expect(screen.getByRole('button', { name: 'Signer' }).textContent).toContain('Locked owner')
  expectSafeSubmissionDisabled()
  await user.click(screen.getByRole('button', { name: 'Signer' }))
  await user.click(screen.getByRole('option', { name: /Detached owner/ }))
  expect(screen.getByRole('button', { name: 'Signer' }).textContent).toContain('Detached owner')
  expectSafeSubmissionDisabled('No signer attached')
})

it.each(['account removed', 'account recreated', 'foreign profile', 'owner removed', 'watch-only'] as const)(
  'clears a selection after %s without silently selecting it again',
  async (change) => {
    const owner = ownerAccount('Selected owner')
    fixture.state.reset(stateWithOwners([owner]))
    const { user } = render(<RequestsOverlay capabilities={createCapabilityFake()} onBack={() => {}} />)
    const open = () =>
      user.click(screen.getByRole('button', { name: `Open Safe proposal ${hash} on chain 1` }))
    await open()
    expect(screen.getByRole('button', { name: 'Signer' }).textContent).toContain('Selected owner')
    const next = stateWithOwners([owner])
    if (change === 'account removed') delete next.accounts[owner.accountId]
    if (change === 'account recreated') {
      next.accounts[owner.accountId].created = 'owner:2'
      next.accounts[address].safeOwners!['1'][0].created = 'owner:2'
    }
    if (change === 'foreign profile') next.accounts[owner.accountId].profileId = 'other-profile'
    if (change === 'owner removed') next.accounts[address].safeOwners = { '1': [] }
    if (change === 'watch-only')
      next.accounts[address].safeOwners = { '1': [{ ...owner, signerAttached: false, status: 'watch-only' }] }
    await act(async () => fixture.state.reset(next))
    expect(screen.queryByRole('button', { name: 'Signer' })?.textContent ?? '').not.toContain(
      'Selected owner'
    )
    await act(async () => fixture.state.reset(stateWithOwners([ownerAccount('Selected owner')])))
    expect(screen.getByRole('button', { name: 'Signer' }).textContent).toContain('Choose an account')
    await user.click(screen.getByRole('button', { name: 'Back to requests' }))
    await open()
    expect(screen.getByRole('button', { name: 'Signer' }).textContent).toContain('Selected owner')
  }
)

it('uses each deployment’s owners and starts a fresh choice after the Safe account is recreated', async () => {
  const first = ownerAccount('Ethereum owner')
  const second = ownerAccount('Optimism owner')
  const next = stateWithOwners([first, second])
  next.accounts[address].safeOwners = { '1': [first], '10': [second] }
  next.accounts[address].safe!['10'] = { ...deployment, chainId: 10 }
  fixture.state.reset(next)
  const { user } = render(<RequestsOverlay capabilities={createCapabilityFake()} onBack={() => {}} />)
  await user.click(screen.getByRole('button', { name: `Open Safe proposal ${hash} on chain 1` }))
  expect(screen.getByRole('button', { name: 'Signer' }).textContent).toContain('Ethereum owner')
  await user.click(screen.getByRole('button', { name: 'Back to requests' }))
  await user.click(screen.getByRole('button', { name: `Open Safe proposal ${hash} on chain 10` }))
  expect(screen.getByRole('button', { name: 'Signer' }).textContent).toContain('Optimism owner')
  const recreated = structuredClone(next)
  recreated.accounts[address].created = 'safe:2'
  recreated.accounts[address].safeOwners!['10'] = [first, second]
  await act(async () => fixture.state.reset(recreated))
  expect(screen.getByRole('button', { name: 'Signer' }).textContent).toContain('Choose an account')
})

it('defaults a sole disconnected signing account and retains it when the signer attaches', async () => {
  const locked = ownerAccount('Locked owner', {
    signerAttached: false,
    status: 'unavailable',
    signerStatus: 'Wallet locked'
  })
  fixture.state.reset(stateWithOwners([locked]))
  const { user } = render(<RequestsOverlay capabilities={createCapabilityFake()} onBack={() => {}} />)
  await user.click(screen.getByRole('button', { name: `Open Safe proposal ${hash} on chain 1` }))
  expect(screen.getByRole('button', { name: 'Signer' }).textContent).toContain('Locked owner')
  expect(screen.getByRole('button', { name: 'Signer' }).hasAttribute('disabled')).toBe(false)
  expectSafeSubmissionDisabled('No signer attached')
  await act(async () => fixture.state.reset(stateWithOwners([{ ...locked, signerAttached: true }])))
  expect(screen.getByRole('button', { name: 'Signer' }).textContent).toContain('Locked owner')
  await user.click(screen.getByRole('button', { name: 'Signer' }))
  expect(screen.getByText('Hot Signer · Wallet locked')).toBeTruthy()
  await user.click(screen.getByRole('option', { name: /Locked owner/ }))
  expect(screen.getByRole('button', { name: 'Signer' }).textContent).toContain('Locked owner')
  expectSafeSubmissionDisabled()
  expect(screen.getByLabelText('Transaction details')).toBeTruthy()
})

it('keeps confirmed owners selectable as the proposal advances to execution', async () => {
  const first = ownerAccount('Ledger owner', { signerType: 'ledger' })
  const second = ownerAccount('Other owner', { address: `0x${'3'.repeat(40)}` })
  const next = structuredClone(stateWithOwners([first, second]))
  const safe = next.accounts[address].safe!['1']!
  safe.configuration = {
    ...safe.configuration,
    owners: [first.address, second.address],
    threshold: 2,
    nonce: '3'
  }
  safe.pending![0]!.confirmations = [first.address, first.address, address]
  fixture.state.reset(next)
  const { user } = render(<RequestsOverlay capabilities={createCapabilityFake()} onBack={() => {}} />)
  await user.click(screen.getByRole('button', { name: `Open Safe proposal ${hash} on chain 1` }))
  expect(screen.getByText('Signer')).toBeTruthy()
  expectSafeSubmissionDisabled()
  await user.click(screen.getByRole('button', { name: 'Signer' }))
  await user.click(screen.getByRole('option', { name: /Ledger owner/ }))

  const confirmed = structuredClone(next)
  confirmed.accounts[address].safe!['1']!.pending![0]!.confirmations = [first.address, second.address]
  await act(async () => fixture.state.reset(confirmed))
  expect(screen.getByText('Awaiting execution')).toBeTruthy()
  expect(screen.getByText('Signer')).toBeTruthy()
  const chooser = screen.getByRole('button', { name: 'Signer' })
  expect(chooser.hasAttribute('disabled')).toBe(false)
  expect(within(chooser).getByText('Ledger owner')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Execute' }).hasAttribute('disabled')).toBe(true)
  expect(screen.getByRole('button', { name: 'Decline' }).hasAttribute('disabled')).toBe(true)
  await user.click(screen.getByRole('button', { name: 'Execute' }))
  expect(screen.getByText('Awaiting execution')).toBeTruthy()

  const disconnected = structuredClone(confirmed)
  disconnected.accounts[address].safeOwners!['1']![0] = {
    ...first,
    signerAttached: false,
    signerStatus: 'Signer unavailable',
    status: 'unavailable'
  }
  await act(async () => fixture.state.reset(disconnected))
  expect(screen.getByText('Signer')).toBeTruthy()
  expect(screen.getByText('Awaiting execution')).toBeTruthy()
  expect(within(chooser).getByText('Ledger owner')).toBeTruthy()
  expectSafeSubmissionDisabled('No signer attached')
  await user.click(chooser)
  await user.click(screen.getByRole('option', { name: /Other owner/ }))
  await user.click(chooser)
  expect(screen.getByRole('option', { name: /Ledger owner/ }).hasAttribute('disabled')).toBe(false)
  await user.click(screen.getByRole('option', { name: /Ledger owner/ }))
  expectSafeSubmissionDisabled('No signer attached')

  const waiting = structuredClone(confirmed)
  waiting.accounts[address].safe!['1']!.pending![0]!.nonce = '4'
  await act(async () => fixture.state.reset(waiting))
  expect(screen.getByText('Waiting for earlier transactions')).toBeTruthy()
  expect(screen.queryByText('Awaiting execution')).toBeNull()
  expect(screen.getByRole('button', { name: 'Execute' }).hasAttribute('disabled')).toBe(true)
})

it.each(['empty', 'watch-only', 'detached', 'locked'] as const)(
  'keeps Safe actions disabled with %s owners',
  async (kind) => {
    const owners =
      kind === 'empty'
        ? []
        : [
            ownerAccount('Owner', {
              signerAttached: kind === 'locked',
              signerType: kind === 'watch-only' ? 'address' : 'seed',
              signerStatus: kind === 'locked' ? 'locked' : 'Signer unavailable',
              status: kind === 'watch-only' ? 'watch-only' : 'unavailable'
            })
          ]
    fixture.state.reset(stateWithOwners(owners))
    const { user } = render(<RequestsOverlay capabilities={createCapabilityFake()} onBack={() => {}} />)
    await user.click(screen.getByRole('button', { name: `Open Safe proposal ${hash} on chain 1` }))
    const chooser = screen.getByRole('button', { name: 'Signer' })
    expect(chooser.hasAttribute('disabled')).toBe(kind === 'empty' || kind === 'watch-only')
    if (kind === 'locked' || kind === 'detached') {
      expect(within(chooser).getByText('Owner')).toBeTruthy()
    } else {
      expect(chooser.textContent).toBe('No attached signer for the Safe')
    }
    const primary = kind === 'detached' ? 'No signer attached' : 'Sign'
    expectSafeSubmissionDisabled(primary)
    await user.click(screen.getByRole('button', { name: primary }))
    await user.click(screen.getByRole('button', { name: 'Decline' }))
    expect(screen.getByLabelText('Request review')).toBeTruthy()
  }
)

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
  expect(screen.getByText('No attached signer for the Safe')).toBeTruthy()
  expectSafeSubmissionDisabled()
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
  expect(screen.getByRole('alert', { name: 'Safe nonce warning' }).textContent).toMatch(
    /Simulation uses current state; earlier proposals are not included/
  )
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
      expect(effects.getByText('No supported asset changes detected.')).toBeTruthy()
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

it('invalidates signed fields while retaining the preview across cached configuration and confirmation updates', async () => {
  fixture.state.reset(state())
  const first = deferredPreview(),
    changed = deferredPreview()
  const capabilities = createCapabilityFake()
  capabilities.safe.simulate.mockReturnValueOnce(first.promise).mockReturnValueOnce(changed.promise)
  const { user } = render(<RequestsOverlay capabilities={capabilities} onBack={() => {}} />)
  await user.click(screen.getByRole('button', { name: `Open Safe proposal ${hash} on chain 1` }))
  const confirmed = structuredClone(deployment)
  confirmed.pending![0]!.confirmations = [address]
  await act(async () => fixture.state.reset(state(confirmed)))
  const changedProposal = {
    ...confirmed,
    pending: confirmed.pending!.map((proposal) => ({ ...proposal, value: '2' }))
  }
  await act(async () => fixture.state.reset(state(changedProposal)))
  await act(async () => first.resolve(success('Old fields')))
  expect(screen.queryByText('Old fields')).toBeNull()
  const changedConfig = {
    ...changedProposal,
    configuration: {
      ...changedProposal.configuration,
      nonce: '3',
      owners: [address, ownerAccount('New').address],
      threshold: 2
    }
  }
  await act(async () => fixture.state.reset(state(changedConfig)))
  await act(async () => changed.resolve(success('Configured preview')))
  expect(screen.getByText('Configured preview')).toBeTruthy()
  await act(async () => fixture.state.reset(state(changedProposal)))
  expect(screen.getByText('Configured preview')).toBeTruthy()
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
  expect(screen.getByRole('alert', { name: 'Delegatecall warning' })).toBeTruthy()
  expect(screen.getByText('1.0 native')).toBeTruthy()
  expect(screen.getByLabelText('Transaction effects').textContent).toContain('Simulation unavailable.')
  expect(screen.queryByText('Approval threshold')).toBeNull()
  expect(screen.queryByText('Safe version')).toBeNull()
  expect(screen.queryByText('Owner')).toBeNull()
  expect(screen.queryByText('Last refreshed')).toBeNull()
  expect(screen.queryByText('Network')).toBeNull()
  expect(screen.getByLabelText('Transaction details').textContent).toMatch(/Call contract.*On contract/)
  expect(screen.getAllByRole('button', { name: /^Back/ })).toHaveLength(1)
  expect(screen.getByText('Safe proposal')).toBeTruthy()
  await user.click(screen.getByRole('button', { name: 'Back to requests' }))
  expect(screen.queryByLabelText('Request review')).toBeNull()
  await user.click(screen.getByRole('button', { name: `Open Safe proposal ${hash} on chain 1` }))
  await user.click(screen.getByRole('button', { name: /Show full calldata/ }))
  expect(screen.getAllByText('0x1234')).toHaveLength(2)
  expect(screen.getByText('Estimated changes')).toBeTruthy()
  expectSafeSubmissionDisabled()
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
  expect(screen.getByText('Call transfer')).toBeTruthy()
  expect(screen.queryByText('Unverified decoding')).toBeNull()
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

it('keeps matching Safe checks silent and exposes raw integer arguments, confirmations and signing fields on demand', async () => {
  const capabilities = createCapabilityFake()
  const proposal = {
    ...deployment.pending![0]!,
    operation: 0 as const,
    value: '0',
    nonce: '3',
    confirmations: [address],
    integrity: { status: 'matched' as const, reason: 'Hash matches' },
    localDecoded: {
      method: 'approve',
      source: 'Local function selector',
      parameters: [{ name: 'amount', type: 'uint256', value: '1000000' }]
    }
  }
  const { user } = render(
    <SafeProposalDetailsView
      deployment={deployment}
      proposal={proposal}
      simulation={{ status: 'success', effects: [], ...previewContext, currentNonce: '3' }}
      networkName='Ethereum'
      symbol='ETH'
      capabilities={capabilities}
    />
  )
  const summary = screen.getByLabelText('Request summary')
  const effects = screen.getByLabelText('Transaction effects')
  expect(summary.textContent).not.toContain('Account')
  expect(summary.compareDocumentPosition(effects) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  const account = screen.getByText('Account')
  expect(
    screen.getByLabelText('Verification details').compareDocumentPosition(account) &
      Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy()
  expect(screen.queryByLabelText('Proposal integrity')).toBeNull()
  expect(screen.queryByLabelText('Safe nonce warning')).toBeNull()
  expect(screen.queryByText('Native value')).toBeNull()
  expect(screen.queryByText('ABI source')).toBeNull()
  expect(screen.getByLabelText('Transaction details').textContent).toMatch(
    /Call approve.*On contract.*amount \(uint256\).*1000000/
  )
  expect(screen.getByLabelText('Transaction details').textContent).not.toMatch(/allowance|ETH|Nonce/i)
  await user.click(screen.getByRole('button', { name: '1 / 1 confirmations' }))
  expect(within(summary).getAllByText(address)).toHaveLength(1)
  await user.click(screen.getByRole('button', { name: 'Copy safe transaction hash' }))
  expect(capabilities.external.writeText).toHaveBeenCalledWith(hash)
  await user.click(screen.getByRole('button', { name: 'Raw transaction' }))
  await user.click(screen.getByRole('button', { name: 'Copy raw transaction' }))
  expect(capabilities.external.writeText).toHaveBeenLastCalledWith(expect.stringContaining('"nonce": "3"'))
  expectSafeSubmissionDisabled('Execute')
})

it.each([
  {
    nonce: '4',
    status: 'matched' as const,
    nonceText: /depends on earlier transactions.*Current Safe nonce: 3.*Simulation uses current state/
  },
  { nonce: '2', status: 'unavailable' as const, nonceText: /is stale.*Current Safe nonce: 3/ },
  { nonce: '4', status: 'mismatch' as const, nonceText: /depends on earlier transactions/ }
])(
  'shows independent delegatecall, nonce and integrity warnings for $status',
  ({ nonce, status, nonceText }) => {
    render(
      <SafeProposalDetailsView
        deployment={deployment}
        proposal={{ ...deployment.pending![0]!, nonce, integrity: { status, reason: 'Verification reason' } }}
        simulation={{ status: 'success', effects: [], ...previewContext, currentNonce: '3' }}
        networkName='Ethereum'
        symbol='ETH'
        capabilities={createCapabilityFake()}
      />
    )
    expect(screen.getByRole('alert', { name: 'Delegatecall warning' })).toBeTruthy()
    expect(screen.getByRole('alert', { name: 'Safe nonce warning' }).textContent).toMatch(nonceText)
    expect(screen.queryByLabelText('Proposal integrity') !== null).toBe(status !== 'matched')
    if (status !== 'matched')
      expect(screen.getByRole('alert', { name: 'Proposal integrity' }).textContent).toContain(
        'Verification reason'
      )
  }
)
