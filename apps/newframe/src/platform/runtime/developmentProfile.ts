import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFile, lstat, mkdir, mkdtemp, readdir, rename, rm, stat } from 'node:fs/promises'
import type { Stats } from 'node:fs'
import path from 'node:path'

const canonicalProfileName = 'Newframe dev'
const durableFiles = ['config.json', 'vault.json'] as const
const gitLocalEnvironmentVariables = [
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_CONFIG',
  'GIT_CONFIG_PARAMETERS',
  'GIT_CONFIG_COUNT',
  'GIT_OBJECT_DIRECTORY',
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_IMPLICIT_WORK_TREE',
  'GIT_GRAFT_FILE',
  'GIT_INDEX_FILE',
  'GIT_NO_REPLACE_OBJECTS',
  'GIT_REPLACE_REF_BASE',
  'GIT_PREFIX',
  'GIT_SHALLOW_FILE',
  'GIT_COMMON_DIR'
] as const

type GitCommandResult = {
  exitCode: number | null
  stdout: string
}

type DevelopmentProfileDependencies = {
  runGit?: (arguments_: readonly string[], cwd: string) => Promise<GitCommandResult>
  copyFile?: (source: string, destination: string) => Promise<void>
}

function runGit(arguments_: readonly string[], cwd: string): Promise<GitCommandResult> {
  return new Promise((resolve, reject) => {
    const environment = { ...process.env }
    for (const variable of gitLocalEnvironmentVariables) delete environment[variable]

    const child = spawn('git', arguments_, {
      cwd,
      env: environment,
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true
    })
    let stdout = ''

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk
    })
    child.once('error', reject)
    child.once('close', (exitCode) => {
      resolve({ exitCode, stdout })
    })
  })
}

function commandOutput(result: GitCommandResult): string | undefined {
  if (result.exitCode !== 0) return undefined

  const output = result.stdout.replace(/\r?\n$/, '')
  return output.length > 0 ? output : undefined
}

function slugBranch(branch: string): string {
  const slug = branch
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '')

  return slug || 'branch'
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

async function exists(target: string): Promise<boolean> {
  try {
    await lstat(target)
    return true
  } catch (error) {
    if (isMissing(error)) return false
    throw error
  }
}

async function copyOptionalFile(
  source: string,
  destination: string,
  copy: (source: string, destination: string) => Promise<void>
): Promise<void> {
  if (!(await exists(source))) return
  await copy(source, destination)
}

async function copyDirectory(
  source: string,
  destination: string,
  copy: (source: string, destination: string) => Promise<void>,
  sourceStats: Stats
): Promise<void> {
  if (!sourceStats.isDirectory()) throw new Error('Signer entry is not a directory')

  await mkdir(destination)

  for (const entry of await readdir(source)) {
    const sourceEntry = path.join(source, entry)
    const destinationEntry = path.join(destination, entry)
    const entryStats = await lstat(sourceEntry)

    if (entryStats.isDirectory()) {
      await copyDirectory(sourceEntry, destinationEntry, copy, entryStats)
    } else if (entryStats.isFile()) {
      await copy(sourceEntry, destinationEntry)
    } else {
      throw new Error('Signer entry must be a regular file or directory')
    }
  }
}

async function copyOptionalDirectory(
  source: string,
  destination: string,
  copy: (source: string, destination: string) => Promise<void>
): Promise<void> {
  let sourceStats: Stats

  try {
    sourceStats = await lstat(source)
  } catch (error) {
    if (isMissing(error)) return
    throw error
  }

  await copyDirectory(source, destination, copy, sourceStats)
}

export async function prepareDevelopmentProfile(
  applicationDataDirectory: string,
  repositoryCheckoutDirectory: string,
  dependencies: DevelopmentProfileDependencies = {}
): Promise<string> {
  if (!path.isAbsolute(applicationDataDirectory) || !path.isAbsolute(repositoryCheckoutDirectory)) {
    throw new Error('Development profile paths must be absolute')
  }

  const executeGit = dependencies.runGit ?? runGit
  let branch: string | undefined
  let worktreeGitDirectory: string | undefined
  let commonGitDirectory: string | undefined

  try {
    const branchResult = await executeGit(
      ['symbolic-ref', '--quiet', '--short', 'HEAD'],
      repositoryCheckoutDirectory
    )
    if (branchResult.exitCode === 0) {
      branch = commandOutput(branchResult)
      if (!branch) throw new Error('Git returned an empty branch')
    } else if (branchResult.exitCode !== 1) {
      throw new Error('Git could not resolve HEAD')
    }
    worktreeGitDirectory = commandOutput(
      await executeGit(['rev-parse', '--absolute-git-dir'], repositoryCheckoutDirectory)
    )
    commonGitDirectory = commandOutput(
      await executeGit(
        ['rev-parse', '--path-format=absolute', '--git-common-dir'],
        repositoryCheckoutDirectory
      )
    )
  } catch {
    throw new Error('Unable to resolve Git checkout for development profile')
  }

  if (
    !worktreeGitDirectory ||
    !commonGitDirectory ||
    !path.isAbsolute(worktreeGitDirectory) ||
    !path.isAbsolute(commonGitDirectory)
  ) {
    throw new Error('Unable to resolve Git checkout for development profile')
  }

  const canonicalProfileDirectory = path.join(applicationDataDirectory, canonicalProfileName)
  const isCanonical =
    branch === 'main' && path.normalize(worktreeGitDirectory) === path.normalize(commonGitDirectory)

  if (isCanonical) {
    await mkdir(canonicalProfileDirectory, { recursive: true })
    return canonicalProfileDirectory
  }

  const label = branch ? `branch-${slugBranch(branch)}` : 'detached'
  const identity = createHash('sha256')
    .update(JSON.stringify([path.normalize(worktreeGitDirectory), branch ?? null]))
    .digest('hex')
    .slice(0, 12)
  const profileDirectory = path.join(
    applicationDataDirectory,
    `${canonicalProfileName}--${label}-${identity}`
  )

  if (await exists(profileDirectory)) return profileDirectory

  try {
    const canonicalStats = await stat(canonicalProfileDirectory)
    if (!canonicalStats.isDirectory()) throw new Error('Canonical profile is not a directory')
  } catch {
    throw new Error(
      'Canonical development profile is missing; launch canonical main once before this checkout'
    )
  }

  let temporaryDirectory: string | undefined

  try {
    temporaryDirectory = await mkdtemp(`${profileDirectory}.tmp-`)
    const copy = dependencies.copyFile ?? copyFile

    for (const file of durableFiles) {
      await copyOptionalFile(
        path.join(canonicalProfileDirectory, file),
        path.join(temporaryDirectory, file),
        copy
      )
    }
    await copyOptionalDirectory(
      path.join(canonicalProfileDirectory, 'signers'),
      path.join(temporaryDirectory, 'signers'),
      copy
    )

    await rename(temporaryDirectory, profileDirectory)
    temporaryDirectory = undefined
    return profileDirectory
  } catch {
    if (temporaryDirectory) {
      await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined)
    }
    throw new Error('Failed to initialize isolated development profile')
  }
}
