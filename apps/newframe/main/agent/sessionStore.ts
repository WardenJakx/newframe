import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'

export type AgentDescriptor = {
  name: string
  description?: string
  url?: string
}

export type AgentSession = {
  sessionId: string
  tokenHash: Buffer
  descriptor: AgentDescriptor
  accountId: string
  createdAt: number
  expiresAt: number
  revokedAt?: number
}

export type AgentSessionCredentials = {
  sessionId: string
  sessionToken: string
  account: string
  descriptor: AgentDescriptor
  expiresAt: number
}

const tokenDigest = (token: string) => createHash('sha256').update(token, 'utf8').digest()

export class AgentSessionStore {
  private readonly sessions = new Map<string, AgentSession>()

  constructor(private readonly now: () => number = Date.now) {}

  create(accountId: string, descriptor: AgentDescriptor, durationSeconds: number): AgentSessionCredentials {
    const createdAt = this.now()
    const sessionId = randomUUID()
    const sessionToken = randomBytes(32).toString('base64url')
    const expiresAt = createdAt + durationSeconds * 1_000
    const normalizedAccount = accountId.toLowerCase()

    this.sessions.set(sessionId, {
      sessionId,
      tokenHash: tokenDigest(sessionToken),
      descriptor: { ...descriptor },
      accountId: normalizedAccount,
      createdAt,
      expiresAt
    })

    return {
      sessionId,
      sessionToken,
      account: normalizedAccount,
      descriptor: { ...descriptor },
      expiresAt
    }
  }

  authenticate(sessionId: string, token: string): AgentSession | undefined {
    const session = this.sessions.get(sessionId)
    if (!session || session.revokedAt || session.expiresAt <= this.now()) return

    const presentedHash = tokenDigest(token)
    if (
      presentedHash.length !== session.tokenHash.length ||
      !timingSafeEqual(presentedHash, session.tokenHash)
    ) {
      return
    }

    return session
  }

  isActive(sessionId: string, accountId: string) {
    const session = this.sessions.get(sessionId)
    return Boolean(
      session &&
      !session.revokedAt &&
      session.expiresAt > this.now() &&
      session.accountId === accountId.toLowerCase()
    )
  }

  revoke(sessionId: string) {
    const session = this.sessions.get(sessionId)
    if (!session || session.revokedAt) return false
    session.revokedAt = this.now()
    return true
  }

  revokeAccount(accountId: string) {
    const normalizedAccount = accountId.toLowerCase()
    let revoked = 0
    for (const session of this.sessions.values()) {
      if (session.accountId === normalizedAccount && !session.revokedAt) {
        session.revokedAt = this.now()
        revoked += 1
      }
    }
    return revoked
  }
}
