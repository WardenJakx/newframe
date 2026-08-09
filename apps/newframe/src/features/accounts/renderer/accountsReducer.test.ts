import { describe, expect, it } from 'bun:test'

import { accountsReducer, createAccountsState } from './accountsReducer'

describe('accounts reducer', () => {
  it('transitions coupled menu, move, export, and drag state through named events', () => {
    let state = createAccountsState(false)
    state = accountsReducer(state, { type: 'menu.toggled', accountId: 'account-1' })
    state = accountsReducer(state, { type: 'move.opened', accountId: 'account-1' })
    state = accountsReducer(state, {
      type: 'move.started',
      accountId: 'account-1',
      operationId: 'operation-1',
      profileId: 'profile-2'
    })
    expect(state.move).toEqual({
      kind: 'pending',
      accountId: 'account-1',
      operationId: 'operation-1',
      profileId: 'profile-2'
    })

    state = accountsReducer(state, { type: 'panel.export-opened', accountId: 'account-1' })
    state = accountsReducer(state, { type: 'export.password-changed', password: 'secret' })
    state = accountsReducer(state, { type: 'drag.started', accountId: 'account-1' })
    state = accountsReducer(state, { type: 'drag.entered', accountId: 'account-2' })
    expect(state.panel).toEqual({ kind: 'export', accountId: 'account-1' })
    expect(state.export.password).toBe('secret')
    expect(state.drag).toEqual({ accountId: 'account-1', overAccountId: 'account-2' })
  })
})
