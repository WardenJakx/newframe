import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { chmod, lstat, mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'

import { stateDirectory } from './storage.js'

export type ActionProgress = { phase: 'sending' } | { phase: 'sent'; hash: string; confirmed: boolean }

export interface SubmitProgress {
  account: string
  actions: Partial<Record<'wrap' | 'approval', ActionProgress>>
  orderId?: string
  raw?: unknown
}

function hasErrno(error: unknown, code: string) {
  return error instanceof Error && 'code' in error && error.code === code
}

function journalPath(directory: string, key: string) {
  if (!/^[0-9a-f]{64}$/.test(key)) {
    throw new Error('Invalid Flash submission key')
  }
  return join(directory, `submit-${key}.json`)
}

async function prepareDirectory(directory: string) {
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const stat = await lstat(directory)
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error('CLI state path must be a directory')
  }
  await chmod(directory, 0o700)
}

export async function readSubmitProgress(
  key: string,
  directory = stateDirectory()
): Promise<SubmitProgress | null> {
  const path = journalPath(directory, key)
  const stat = await lstat(path).catch((error: unknown) => {
    if (hasErrno(error, 'ENOENT')) {
      return null
    }
    throw error
  })
  if (!stat) {
    return null
  }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.mode & 0o077) {
    throw new Error('Flash submission journal is not a private regular file')
  }
  const value: unknown = JSON.parse(await readFile(path, 'utf8'))
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid Flash submission journal')
  }
  const progress = value as Partial<SubmitProgress>
  if (typeof progress.account !== 'string' || !progress.actions || typeof progress.actions !== 'object') {
    throw new Error('Invalid Flash submission journal')
  }
  for (const value of Object.values(progress.actions as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') {
      throw new Error('Invalid Flash submission journal')
    }
    const step = value as Record<string, unknown>
    if (
      step.phase !== 'sending' &&
      (step.phase !== 'sent' ||
        typeof step.hash !== 'string' ||
        !/^0x[0-9a-f]{64}$/i.test(step.hash) ||
        typeof step.confirmed !== 'boolean')
    ) {
      throw new Error('Invalid Flash submission journal')
    }
  }
  if (progress.orderId !== undefined && typeof progress.orderId !== 'string') {
    throw new Error('Invalid Flash submission journal')
  }
  return progress as SubmitProgress
}

export async function saveSubmitProgress(
  key: string,
  progress: SubmitProgress,
  directory = stateDirectory()
) {
  await prepareDirectory(directory)
  const path = journalPath(directory, key)
  const existing = await lstat(path).catch((error: unknown) => {
    if (hasErrno(error, 'ENOENT')) {
      return null
    }
    throw error
  })
  if (existing && (!existing.isFile() || existing.isSymbolicLink())) {
    throw new Error('Flash submission journal path is not a regular file')
  }
  const temporary = join(directory, `.submit-${key}-${randomUUID()}.tmp`)
  const file = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600)
  try {
    await file.writeFile(`${JSON.stringify(progress)}\n`)
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

function processIsAlive(pid: number) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false
  }
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH'
  }
}

export async function withSubmitLock<T>(
  key: string,
  task: () => Promise<T>,
  directory = stateDirectory()
): Promise<T> {
  await prepareDirectory(directory)
  const lockPath = `${journalPath(directory, key)}.lock`
  let locked = false
  for (let attempt = 0; attempt < 2 && !locked; attempt++) {
    let created = false
    try {
      const file = await open(lockPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600)
      created = true
      try {
        await file.writeFile(`${process.pid}\n`)
        await file.sync()
      } finally {
        await file.close()
      }
      locked = true
    } catch (error) {
      if (created) {
        await rm(lockPath, { force: true })
      }
      if (!hasErrno(error, 'EEXIST')) {
        throw error
      }
      const stat = await lstat(lockPath)
      if (!stat.isFile() || stat.isSymbolicLink() || stat.mode & 0o077) {
        throw new Error('Flash submission lock is not a private regular file', { cause: error })
      }
      const pid = Number((await readFile(lockPath, 'utf8')).trim())
      if (Date.now() - stat.mtimeMs < 2_000 || processIsAlive(pid)) {
        throw new Error('Another CLI process is submitting this Flash quote', { cause: error })
      }
      await rm(lockPath)
    }
  }
  if (!locked) {
    throw new Error('Could not acquire Flash submission lock')
  }
  try {
    return await task()
  } finally {
    await rm(lockPath, { force: true })
  }
}
