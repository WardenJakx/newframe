import { describe, expect, it } from 'bun:test'

import { addAccountReducer, createAddAccountState } from './addAccountReducer'

describe('add account reducer', () => {
  it('resets coupled flow drafts and preserves independent vault knowledge', () => {
    let state = createAddAccountState({ initialSelectedSigner: '', initialType: 'watch' })
    state = addAccountReducer(state, {
      type: 'vault.loaded',
      vault: { exists: true, unlocked: false }
    })
    state = addAccountReducer(state, { type: 'form.input-changed', value: 'old.eth' })
    state = addAccountReducer(state, { type: 'flow.category-selected', category: 'hardware' })

    expect(state.addAccountInput).toBe('')
    expect(state.addAccountCategory).toBe('hardware')
    expect(state.addVaultState).toEqual({ exists: true, unlocked: false })
  })

  it('keeps hardware input and generated-seed transitions explicit', () => {
    let state = createAddAccountState({ initialSelectedSigner: 'trezor-1', initialType: 'trezor' })
    state = addAccountReducer(state, { type: 'hardware.pin-appended', digit: 1 })
    state = addAccountReducer(state, {
      type: 'hardware.input-submitted',
      input: 'pin',
      status: 'PIN submitted'
    })
    expect(state.addHardwarePin).toBe('')
    expect(state.addAccountStatus).toBe('PIN submitted')
    state = addAccountReducer(state, { type: 'seed.generated', phrase: 'one two three four' })
    state = addAccountReducer(state, { type: 'seed.backup-toggled' })

    expect(state.addGeneratedPhrase).toBe('one two three four')
    expect(state.addGeneratedPhraseBackedUp).toBe(true)
  })
})
