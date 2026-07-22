import { describe, expect, it } from 'bun:test'

import { AgentSessionStore } from '../../../main/agent/sessionStore'

describe('agent session store', () => {
  it('returns a one-time credential while retaining only its hash', () => {
    let now = 1_000
    const store = new AgentSessionStore(() => now)
    const credentials = store.create(
      '0x1111111111111111111111111111111111111111',
      { name: 'Harness agent' },
      600
    )

    expect(credentials.sessionToken.length).toBeGreaterThan(32)
    const session = store.authenticate(credentials.sessionId, credentials.sessionToken)
    expect(session?.accountId).toBe('0x1111111111111111111111111111111111111111')
    expect(session).not.toHaveProperty('sessionToken')
    expect(store.authenticate(credentials.sessionId, 'forged-token')).toBeUndefined()

    now = credentials.expiresAt
    expect(store.authenticate(credentials.sessionId, credentials.sessionToken)).toBeUndefined()
  })

  it('invalidates sessions immediately on session or account revocation', () => {
    const store = new AgentSessionStore(() => 1_000)
    const first = store.create('0x1111111111111111111111111111111111111111', { name: 'One' }, 600)
    const second = store.create('0x2222222222222222222222222222222222222222', { name: 'Two' }, 600)

    expect(store.revoke(first.sessionId)).toBe(true)
    expect(store.authenticate(first.sessionId, first.sessionToken)).toBeUndefined()
    expect(store.authenticate(second.sessionId, second.sessionToken)).toBeDefined()

    expect(store.revokeAccount(second.account)).toBe(1)
    expect(store.authenticate(second.sessionId, second.sessionToken)).toBeUndefined()
  })
})
