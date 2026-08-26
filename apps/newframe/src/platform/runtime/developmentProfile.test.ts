import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { prepareDevelopmentProfile } from './developmentProfile'

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

function git(cwd: string, ...arguments_: string[]): string {
  const environment = { ...process.env }
  for (const variable of gitLocalEnvironmentVariables) delete environment[variable]
  environment.GIT_CONFIG_GLOBAL = path.join(cwd, '.test-gitconfig')
  environment.GIT_CONFIG_NOSYSTEM = '1'

  return execFileSync('git', arguments_, {
    cwd,
    encoding: 'utf8',
    env: environment
  }).replace(/\r?\n$/, '')
}

async function write(target: string, contents: string): Promise<void> {
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, contents)
}

async function tree(root: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {}

  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name)
      const relative = path.relative(root, absolute)

      if (entry.isDirectory()) {
        result[`${relative}/`] = 'directory'
        await visit(absolute)
      } else {
        result[relative] = await readFile(absolute, 'utf8')
      }
    }
  }

  await visit(root)
  return result
}

describe('prepareDevelopmentProfile', () => {
  let fixtureRoot: string
  let repository: string
  let applicationData: string

  beforeEach(async () => {
    fixtureRoot = await mkdtemp(path.join(tmpdir(), 'newframe-development-profile-'))
    repository = path.join(fixtureRoot, 'repository')
    applicationData = path.join(fixtureRoot, 'application-data')
    await mkdir(repository)
    await mkdir(applicationData)
    git(repository, 'init', '--quiet', '--initial-branch=main')
  })

  afterEach(async () => {
    await rm(fixtureRoot, { recursive: true, force: true })
  })

  it('uses the canonical profile for attached main in the primary checkout', async () => {
    const profile = await prepareDevelopmentProfile(applicationData, repository)

    expect(profile).toBe(path.join(applicationData, 'Newframe dev'))
    expect(await tree(profile)).toEqual({})
  })

  it('isolates a feature branch in the primary checkout', async () => {
    const canonical = path.join(applicationData, 'Newframe dev')
    await write(path.join(canonical, 'config.json'), 'canonical config')
    git(repository, 'switch', '--quiet', '--create', 'feature/wallet-polish')

    const profile = await prepareDevelopmentProfile(applicationData, repository)

    expect(path.basename(profile)).toMatch(/^Newframe dev--branch-feature-wallet-polish-[0-9a-f]{12}$/)
    expect(await readFile(path.join(profile, 'config.json'), 'utf8')).toBe('canonical config')
  })

  it('isolates linked main from primary main', async () => {
    const linked = path.join(fixtureRoot, 'linked-main')
    await write(path.join(repository, 'tracked.txt'), 'initial')
    git(repository, 'add', 'tracked.txt')
    git(
      repository,
      '-c',
      'user.name=Newframe Test',
      '-c',
      'user.email=newframe@example.test',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '--quiet',
      '--message=initial'
    )
    git(repository, 'switch', '--quiet', '--create', 'feature/primary')
    git(repository, 'worktree', 'add', '--quiet', linked, 'main')
    await mkdir(path.join(applicationData, 'Newframe dev'))

    const profile = await prepareDevelopmentProfile(applicationData, linked)

    expect(path.basename(profile)).toMatch(/^Newframe dev--branch-main-[0-9a-f]{12}$/)
  })

  it('gives detached worktrees at the same commit distinct identities', async () => {
    const first = path.join(fixtureRoot, 'detached-one')
    const second = path.join(fixtureRoot, 'detached-two')
    await write(path.join(repository, 'tracked.txt'), 'initial')
    git(repository, 'add', 'tracked.txt')
    git(
      repository,
      '-c',
      'user.name=Newframe Test',
      '-c',
      'user.email=newframe@example.test',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '--quiet',
      '--message=initial'
    )
    git(repository, 'worktree', 'add', '--quiet', '--detach', first, 'HEAD')
    git(repository, 'worktree', 'add', '--quiet', '--detach', second, 'HEAD')
    await mkdir(path.join(applicationData, 'Newframe dev'))

    const firstProfile = await prepareDevelopmentProfile(applicationData, first)
    const secondProfile = await prepareDevelopmentProfile(applicationData, second)

    expect(path.basename(firstProfile)).toMatch(/^Newframe dev--detached-[0-9a-f]{12}$/)
    expect(path.basename(secondProfile)).toMatch(/^Newframe dev--detached-[0-9a-f]{12}$/)
    expect(firstProfile).not.toBe(secondProfile)
  })

  it('keeps identity independent of commits', async () => {
    const canonical = path.join(applicationData, 'Newframe dev')
    const gitDirectory = path.join(fixtureRoot, 'controlled-git-directory')
    const calls: string[][] = []
    await mkdir(canonical)

    const runGit = async (arguments_: readonly string[]) => {
      calls.push([...arguments_])
      if (arguments_[0] === 'symbolic-ref') {
        return { exitCode: 0, stdout: 'feature/controlled\n' }
      }
      if (arguments_.includes('--absolute-git-dir')) {
        return { exitCode: 0, stdout: `${gitDirectory}\n` }
      }
      return { exitCode: 0, stdout: `${path.join(fixtureRoot, 'common-git-directory')}\n` }
    }

    const first = await prepareDevelopmentProfile(applicationData, repository, { runGit })
    const second = await prepareDevelopmentProfile(applicationData, repository, { runGit })

    expect(second).toBe(first)
    expect(calls).not.toContainEqual(['rev-parse', 'HEAD'])
  })

  it('copies only the durable allowlist and leaves canonical unchanged', async () => {
    const canonical = path.join(applicationData, 'Newframe dev')
    await write(path.join(canonical, 'config.json'), 'config')
    await write(path.join(canonical, 'vault.json'), 'vault')
    await write(path.join(canonical, 'biometrics.json'), 'biometrics')
    await write(path.join(canonical, 'signers', 'nested', 'key.json'), 'signer')
    await write(path.join(canonical, 'Cookies'), 'browser')
    await write(path.join(canonical, 'SingletonLock'), 'lock')
    await write(path.join(canonical, 'logs', 'main.log'), 'log')
    await write(path.join(canonical, 'Cache', 'entry'), 'cache')
    await write(path.join(canonical, 'sessions.json'), 'session')
    await write(path.join(canonical, 'vault.json.backup'), 'backup')
    await write(path.join(canonical, 'vault.json-wal'), 'wal')
    await write(path.join(canonical, 'vault.json-journal'), 'journal')
    await write(path.join(canonical, 'other.json'), 'other')
    const canonicalBefore = await tree(canonical)
    git(repository, 'switch', '--quiet', '--create', 'feature/snapshot')

    const profile = await prepareDevelopmentProfile(applicationData, repository)

    expect(await tree(profile)).toEqual({
      'biometrics.json': 'biometrics',
      'config.json': 'config',
      'signers/': 'directory',
      'signers/nested/': 'directory',
      'signers/nested/key.json': 'signer',
      'vault.json': 'vault'
    })
    expect(await tree(canonical)).toEqual(canonicalBefore)
  })

  it('allows all optional durable entries to be absent', async () => {
    await mkdir(path.join(applicationData, 'Newframe dev'))
    git(repository, 'switch', '--quiet', '--create', 'feature/empty-snapshot')

    const profile = await prepareDevelopmentProfile(applicationData, repository)

    expect(await tree(profile)).toEqual({})
  })

  it('does not resync an existing task profile', async () => {
    const canonical = path.join(applicationData, 'Newframe dev')
    await write(path.join(canonical, 'config.json'), 'first')
    git(repository, 'switch', '--quiet', '--create', 'feature/no-resync')

    const firstProfile = await prepareDevelopmentProfile(applicationData, repository)
    await write(path.join(canonical, 'config.json'), 'second')
    await write(path.join(canonical, 'biometrics.json'), 'later')
    await rm(canonical, { recursive: true })
    const secondProfile = await prepareDevelopmentProfile(applicationData, repository)

    expect(secondProfile).toBe(firstProfile)
    expect(await tree(secondProfile)).toEqual({ 'config.json': 'first' })
  })

  it('fails closed when Git metadata cannot be resolved', async () => {
    const nonRepository = path.join(fixtureRoot, 'not-a-repository')
    await mkdir(nonRepository)

    await expect(prepareDevelopmentProfile(applicationData, nonRepository)).rejects.toThrow(
      'Unable to resolve Git checkout for development profile'
    )
    expect(await tree(applicationData)).toEqual({})
  })

  it('fails closed for an unexpected symbolic-ref exit code', async () => {
    const runGit = async () => ({ exitCode: 128, stdout: '' })

    await expect(prepareDevelopmentProfile(applicationData, repository, { runGit })).rejects.toThrow(
      'Unable to resolve Git checkout for development profile'
    )
    expect(await tree(applicationData)).toEqual({})
  })

  it('fails closed when symbolic-ref is terminated by a signal', async () => {
    const runGit = async () => ({ exitCode: null, stdout: '' })

    await expect(prepareDevelopmentProfile(applicationData, repository, { runGit })).rejects.toThrow(
      'Unable to resolve Git checkout for development profile'
    )
    expect(await tree(applicationData)).toEqual({})
  })

  it('rejects signer symlinks and removes the incomplete task profile', async () => {
    const canonical = path.join(applicationData, 'Newframe dev')
    const signerLink = path.join(canonical, 'signers', 'linked-config.json')
    await write(path.join(canonical, 'config.json'), 'canonical config')
    await mkdir(path.dirname(signerLink))
    await symlink('../config.json', signerLink)
    git(repository, 'switch', '--quiet', '--create', 'feature/signer-symlink')

    await expect(prepareDevelopmentProfile(applicationData, repository)).rejects.toThrow(
      'Failed to initialize isolated development profile'
    )

    expect(await readdir(applicationData)).toEqual(['Newframe dev'])
    expect((await lstat(signerLink)).isSymbolicLink()).toBe(true)
  })

  it('cleans up only its temporary directory after a failed copy', async () => {
    const canonical = path.join(applicationData, 'Newframe dev')
    await write(path.join(canonical, 'config.json'), 'do not expose this')
    git(repository, 'switch', '--quiet', '--create', 'feature/copy-failure')

    await expect(
      prepareDevelopmentProfile(applicationData, repository, {
        copyFile: async () => {
          throw new Error('copy failed with secret contents')
        }
      })
    ).rejects.toThrow('Failed to initialize isolated development profile')

    expect(await tree(applicationData)).toEqual({
      'Newframe dev/': 'directory',
      'Newframe dev/config.json': 'do not expose this'
    })
  })
})
