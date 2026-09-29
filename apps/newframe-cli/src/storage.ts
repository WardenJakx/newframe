import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { chmod, lstat, mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { SessionSchema, type Session as StoredSession } from '@newframe/desktop-api/schemas'

export function stateDirectory(env: NodeJS.ProcessEnv = process.env) {
  return (
    env.NEWFRAME_CLI_STATE_DIR ??
    join(env.XDG_STATE_HOME ?? join(homedir(), '.local', 'state'), 'newframe-cli')
  )
}

async function secureDirectory(path: string) {
  await mkdir(path, { recursive: true, mode: 0o700 })
  const stat = await lstat(path)
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error('CLI state path must be a directory')
  }
  await chmod(path, 0o700)
}

function sessionPath(directory: string) {
  return join(directory, 'session.json')
}

function validateSession(value: unknown): StoredSession {
  const parsed = SessionSchema.safeParse(value)
  if (!parsed.success) {
    throw new Error('Invalid stored session')
  }
  return parsed.data
}

export async function saveSession(session: StoredSession, directory = stateDirectory()) {
  validateSession(session)
  await secureDirectory(directory)
  const path = sessionPath(directory)
  try {
    const stat = await lstat(path)
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error('CLI session path must be a regular file')
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }
  const temporary = join(directory, `.session-${randomUUID()}.tmp`)
  const file = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600)
  try {
    await file.writeFile(`${JSON.stringify(session)}\n`)
    await file.sync()
  } finally {
    await file.close()
  }
  try {
    await rename(temporary, path)
    await chmod(path, 0o600)
  } finally {
    await rm(temporary, { force: true })
  }
}

export async function loadSession(directory = stateDirectory()): Promise<StoredSession> {
  const path = sessionPath(directory)
  const dirStat = await lstat(directory).catch(() => null)
  if (!dirStat || !dirStat.isDirectory() || dirStat.isSymbolicLink()) {
    throw new Error('No CLI session. Run `newframe session start` first.')
  }
  const stat = await lstat(path).catch(() => null)
  if (!stat || !stat.isFile() || stat.isSymbolicLink()) {
    throw new Error('No CLI session. Run `newframe session start` first.')
  }
  if (stat.mode & 0o077) {
    throw new Error('CLI session file is accessible by other users')
  }
  const session = validateSession(JSON.parse(await readFile(path, 'utf8')) as unknown)
  if (session.expiresAt <= Date.now()) {
    throw new Error('CLI session expired. Run `newframe session start`.')
  }
  return session
}

export async function clearSession(directory = stateDirectory()) {
  await rm(sessionPath(directory), { force: true })
}

export function publicSession(session: StoredSession) {
  return { sessionId: session.sessionId, account: session.account, expiresAt: session.expiresAt }
}
