import { expect, it } from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { encrypt } from '@metamask/browser-passworder'
import { Wallet } from 'ethers'

import { createOperationService } from '../../../../platform/operations/service'
import { Signers } from '../../../../platform/signing/signers'
import { persistImportedHotSigners } from '../../../../platform/signing/signers/hot/import'
import type { OwnedOperation } from '../../../../platform/state-store/actions.operation'
import createCanonicalStore from '../../../../platform/state-store/createCanonicalStore'
import type { SafeConfiguration } from '../../domain/safe'
import { createRabbyImportService } from './service'

const password = 'Rabby test password'
const privateKey = '11'.repeat(32)
const address = new Wallet(`0x${privateKey}`).address
const watch = '0x2222222222222222222222222222222222222222'
const safe = '0x3333333333333333333333333333333333333333'
const owner = { clientType: 'wallet-ui' as const, windowInstanceId: 'rabby-tests' }

async function envelope(keyrings: unknown[]) {
  const vault = await encrypt(password, keyrings, undefined, undefined, {
    algorithm: 'PBKDF2',
    params: { iterations: 10_000 }
  })
  return JSON.stringify({
    vault: JSON.parse(vault) as unknown,
    alianNames: [
      { address, name: 'Imported account' },
      { address: watch, name: 'Do not rename duplicate' }
    ]
  })
}

function setup(
  directory: string,
  flush: () => void = () => undefined,
  invalidSafe = false,
  configuration?: () => Promise<SafeConfiguration>
) {
  const { store } = createCanonicalStore({ getItem: () => null, setItem: () => {}, removeItem: () => {} })
  let key: string | null = 'ab'.repeat(32)
  const signers = new Signers(
    {
      store,
      biometrics: { unlock: async () => '' },
      vault: {
        acquireKey: () => key!,
        exists: () => true,
        getKey: () => key,
        isUnlocked: () => key !== null,
        lock: () => {
          key = null
        },
        summary: () => ({ exists: true, unlocked: key !== null }),
        unlock: () => key!,
        unlockWithKey: () => key!
      }
    },
    [],
    () => undefined,
    (records, commit) => persistImportedHotSigners(records, commit, directory)
  )
  const operations = createOperationService({ store, clock: { now: Date.now } })
  const service = createRabbyImportService({
    store,
    operations,
    flush,
    importSigners: (inputs, framePassword, commit) => signers.importHotSigners(inputs, framePassword, commit),
    accountsChanged: () => undefined,
    configuration: async () => {
      if (configuration) {
        return configuration()
      }
      if (invalidSafe) {
        throw new Error('Not a Safe')
      }
      return { owners: [address], threshold: 1, nonce: '0', version: '1.4.1' }
    }
  })
  return { store, service, signers }
}

async function completed(context: ReturnType<typeof setup>, data: string, operationId: string) {
  expect(context.service.import({ type: 'rabby.import', data, password, operationId }, owner)).toBe(true)
  for (let attempts = 0; attempts < 200; attempts++) {
    const operation = (context.store.getState().operations as Record<string, OwnedOperation | undefined>)[
      operationId
    ]?.operation
    if (operation && operation.status !== 'pending') {
      return operation
    }
    await Bun.sleep(5)
  }
  throw new Error('Import did not finish')
}

it('atomically imports new signing/watch/Safe accounts into a profile and skips duplicates across profiles', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'newframe-rabby-service-'))
  const context = setup(directory)
  try {
    context.store.getState().createProfile('other-profile', 'Other profile')
    context.store.getState().upsertAccount({
      id: watch,
      address: watch,
      name: 'Existing name',
      profileId: 'other-profile',
      created: 'new:1',
      lastSignerType: 'Address',
      signer: '',
      status: 'ok'
    })
    const data = await envelope([
      { type: 'Simple Key Pair', data: [privateKey] },
      { type: 'Watch Address', data: { accounts: [watch, '0x4444444444444444444444444444444444444444'] } },
      { type: 'Gnosis', data: { accounts: [safe], networkIdMap: { [safe]: '1' } } }
    ])
    const preview = await context.service.preview({ type: 'rabby.preview', data, password })
    expect(preview).toMatchObject({ ok: true, importCount: 3, skipCount: 1 })
    expect(JSON.stringify(preview)).not.toContain(privateKey)
    const operation = await completed(context, data, 'first-import')
    expect(operation.phase).toBe('imported_3_skipped_1')
    const main = context.store.getState().main
    expect(main.profiles[main.currentProfile]?.name).toBe('Rabby Wallet Import')
    expect(main.accounts[address.toLowerCase()]).toMatchObject({
      name: 'Imported account',
      profileId: main.currentProfile,
      lastSignerType: 'ring'
    })
    expect(main.accounts[watch]).toMatchObject({ name: 'Existing name', profileId: 'other-profile' })
    expect(main.accounts[safe]?.safe?.['1']?.configuration.owners).toEqual([address])
    expect(fs.readdirSync(directory)).toHaveLength(1)
    const profileCount = Object.keys(main.profiles).length
    expect((await completed(context, data, 'second-import')).phase).toBe('imported_0_skipped_4')
    expect(Object.keys(context.store.getState().main.profiles)).toHaveLength(profileCount)
  } finally {
    context.signers.close()
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

it('rolls back accounts, profiles, signer handles and files when persistence fails', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'newframe-rabby-rollback-'))
  const context = setup(directory, () => {
    throw new Error('Storage failure')
  })
  try {
    const previous = context.store.getState().main
    const data = await envelope([{ type: 'Simple Key Pair', data: [privateKey] }])
    const operation = await completed(context, data, 'rollback-import')
    expect(operation.status).toBe('failed')
    expect(context.store.getState().main).toEqual(previous)
    expect(fs.readdirSync(directory)).toEqual([])
    expect(Object.keys(context.store.getState().main.signers)).toEqual([])
  } finally {
    context.signers.close()
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

it('validates every Safe before persisting any signing account', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'newframe-rabby-invalid-safe-'))
  const context = setup(directory, undefined, true)
  try {
    const previous = context.store.getState().main
    const data = await envelope([
      { type: 'Simple Key Pair', data: [privateKey] },
      { type: 'Gnosis', data: { accounts: [safe], networkIdMap: { [safe]: '1' } } }
    ])
    const operation = await completed(context, data, 'invalid-safe-import')
    expect(operation.error?.code).toBe('safe_validation_failed')
    expect(context.store.getState().main).toEqual(previous)
    expect(fs.readdirSync(directory)).toEqual([])
  } finally {
    context.signers.close()
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

it('cancels signing and watch imports if Newframe is locked during Safe validation, even after unlocking', async () => {
  for (const signing of [false, true]) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'newframe-rabby-lock-'))
    let release: (() => void) | undefined
    let started: (() => void) | undefined
    const waiting = new Promise<void>((resolve) => {
      release = resolve
    })
    const ready = new Promise<void>((resolve) => {
      started = resolve
    })
    const context = setup(directory, undefined, false, async () => {
      started?.()
      await waiting
      return { owners: [address], threshold: 1, nonce: '0' }
    })
    try {
      const data = await envelope([
        signing
          ? { type: 'Simple Key Pair', data: [privateKey] }
          : { type: 'Watch Address', data: { accounts: [watch] } },
        { type: 'Gnosis', data: { accounts: [safe], networkIdMap: { [safe]: '1' } } }
      ])
      context.service.import({ type: 'rabby.import', data, password, operationId: 'locked-import' }, owner)
      await ready
      context.store.getState().setAppLock({ locked: true, vaultExists: true })
      context.store.getState().setAppLock({ locked: false, vaultExists: true })
      release?.()
      const operation = await completed(context, data, 'locked-import')
      expect(operation.error?.code).toBe('wallet_locked')
      expect(context.store.getState().main.accounts).toEqual({})
      expect(Object.keys(context.store.getState().main.profiles)).toEqual(['default-profile'])
      expect(fs.readdirSync(directory)).toEqual([])
    } finally {
      context.service.dispose()
      context.signers.close()
      fs.rmSync(directory, { recursive: true, force: true })
    }
  }
})
