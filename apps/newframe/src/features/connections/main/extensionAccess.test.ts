import { describe, expect, it } from 'bun:test'

import { createTestStore } from '../../../../test/support/createTestStore.ts'
import { DEFAULT_PROFILE_ID } from '../../../app/contracts/state/main.ts'
import { createExtensionAccessService } from './extensionAccess.ts'

const extensionId = 'extension-id'
const [one, two, three] = [
  '0x0000000000000000000000000000000000000001',
  '0x0000000000000000000000000000000000000002',
  '0x0000000000000000000000000000000000000003'
]

const account = (id: string, profileId = DEFAULT_PROFILE_ID) => ({
  id,
  profileId,
  address: id,
  name: `Account ${id.slice(-1)}`,
  lastSignerType: 'address',
  status: 'ok',
  signer: '',
  requests: {},
  created: 'test:1'
})

function createHarness() {
  const harness = createTestStore({
    main: {
      knownExtensions: { [extensionId]: true },
      profiles: {
        [DEFAULT_PROFILE_ID]: { id: DEFAULT_PROFILE_ID, name: 'Profile 1' },
        work: { id: 'work', name: 'Work' }
      },
      profileOrder: [DEFAULT_PROFILE_ID, 'work'],
      currentProfile: DEFAULT_PROFILE_ID,
      currentAccount: one,
      accounts: { [one]: account(one), [two]: account(two), [three]: account(three, 'work') },
      accountOrder: [one, two, three]
    }
  })
  return { ...harness, service: createExtensionAccessService(harness.store) }
}

describe('extension account access', () => {
  it('discloses only granted accounts in the current profile and keeps grants across profiles', () => {
    const { actions, service } = createHarness()
    expect(service.accounts(extensionId)).toEqual({ accounts: [], selected: '' })

    actions.setExtensionAccess(extensionId, false, [two])
    expect(service.accounts(extensionId)).toEqual({
      accounts: [{ address: two, name: 'Account 2' }],
      selected: two
    })

    actions.selectProfile('work')
    expect(service.accounts(extensionId)).toEqual({ accounts: [], selected: '' })
    actions.setExtensionAccess(extensionId, false, [three])

    actions.selectProfile(DEFAULT_PROFILE_ID)
    expect(service.accounts(extensionId).accounts.map(({ address }) => address)).toEqual([two])
  })

  it('shares every account in whichever profile is current when all accounts are allowed', () => {
    const { actions, service } = createHarness()
    actions.setExtensionAccess(extensionId, true, [])

    expect(service.accounts(extensionId)).toMatchObject({ all: true, selected: one })
    expect(service.accounts(extensionId).accounts).toHaveLength(2)
    actions.selectProfile('work')
    expect(service.accounts(extensionId)).toEqual({
      accounts: [{ address: three, name: 'Account 3' }],
      selected: three,
      all: true
    })
  })

  it('follows app selections it may see and keeps its account when the app moves elsewhere', () => {
    const { actions, getState, service } = createHarness()
    actions.setExtensionAccess(extensionId, false, [one, two])

    actions.setAccount({ id: two })
    expect(service.accounts(extensionId).selected).toBe(two)

    actions.setExtensionAccess(extensionId, false, [two])
    actions.setAccount({ id: one })
    expect(getState().main.currentAccount).toBe(one)
    expect(service.accounts(extensionId).selected).toBe(two)
  })

  it('selects only visible accounts', () => {
    const { actions, service } = createHarness()
    actions.setExtensionAccess(extensionId, false, [one, two])

    expect(service.select(extensionId, two).selected).toBe(two)
    expect(service.select(extensionId, three).selected).toBe(two)
  })

  it('opens one access prompt and settles with the human decision when it closes', async () => {
    const { actions, getState, service } = createHarness()

    const first = service.request(extensionId)
    const second = service.request(extensionId)
    expect(getState().view).toMatchObject({ notify: 'extensionAccess', notifyData: { id: extensionId } })

    actions.setExtensionAccess(extensionId, false, [one])
    actions.notify('', {})

    const expected = { accounts: [{ address: one, name: 'Account 1' }], selected: one }
    expect(await Promise.all([first, second])).toEqual([expected, expected])
  })

  it('clears access when the extension is no longer trusted', () => {
    const { actions, getState } = createHarness()
    actions.setExtensionAccess(extensionId, true, [])
    actions.trustExtension(extensionId, false)
    actions.setExtensionAccess(extensionId, true, [])

    expect(getState().main.extensionAccess).toEqual({})
  })
})
