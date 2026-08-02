import { afterAll, afterEach, beforeAll, describe, expect, jest as timers, mock, test } from 'bun:test'

import fs from 'fs'
import path from 'path'
import { rm } from 'fs/promises'
import { Mnemonic, randomBytes } from 'ethers'
import log from 'electron-log'
import { createHotSignerChildProcessMock } from '../../../../test/support/bun.mocks.ts'
import { electronMock } from '../../../../test/support/electron.mock.ts'
import { callbackResult, exerciseHotSignerContract } from '../../callback.test-support'

mock.module('child_process', () => createHotSignerChildProcessMock())

const PASSWORD = 'fr@///3_password'
const SIGNER_PATH = path.resolve(import.meta.dirname, '../.userData/signers')
const VAULT_PATH = path.resolve(import.meta.dirname, '../.userData/vault.json')
const addedSigners: any[] = []
const signers = { add: (signer: any) => addedSigners.push(signer) }
const removePath = (target: string) => rm(target, { recursive: true, force: true })
const clean = () => Promise.all([removePath(SIGNER_PATH), removePath(VAULT_PATH)])

let hot: any, store: any, vault: any

describe('Seed signer', () => {
  let signer: any

  beforeAll(async () => {
    log.transports.console.level = false
    electronMock.app.getPath.mockReturnValue(path.resolve(import.meta.dirname, '../.userData'))
    await clean()
    hot = await import('..')
    store = (await import('../../../store')).default
    vault = (await import('../../../vault')).default
  })

  afterEach(() => timers.useRealTimers())
  afterAll(async () => {
    await clean()
    if (signer.status !== 'locked') signer.close()
    log.transports.console.level = 'debug'
  })

  test('Create from invalid phrase', async () => {
    await expect(
      callbackResult((done) => hot.createFromPhrase(vault, signers, 'invalid mnemonic', PASSWORD, done))
    ).rejects.toBeTruthy()
    expect(store.getState().main.signers).toEqual({})
  })

  test('Create from phrase', async () => {
    const mnemonic = Mnemonic.fromEntropy(randomBytes(16)).phrase
    signer = await callbackResult((done) => hot.createFromPhrase(vault, signers, mnemonic, PASSWORD, done))
    expect(signer.status).toBe('ok')
    expect(signer.addresses).toHaveLength(100)
    expect(addedSigners.at(-1)).toBe(signer)
    expect(store.getState().main.signers).toEqual({})
    const stored = JSON.parse(fs.readFileSync(path.resolve(SIGNER_PATH, `${signer.id}.json`), 'utf8'))
    expect(stored.encryptionVersion).toBeUndefined()
  }, 7_500)

  test('Scan for signers', async () => {
    timers.useFakeTimers()
    const found = callbackResult<any>((done) => {
      hot.scan({ add: (value: any) => done(null, value), exists: () => false })
      timers.runAllTimers()
    })
    const scanned = await found
    expect(scanned.type).toBe('seed')
    scanned.close(() => {})
  })

  test('Cancel delayed scan', () => {
    timers.useFakeTimers()
    let additions = 0
    const delayedSigners = { add: () => additions++, exists: () => false }
    hot.scan(delayedSigners).cancel()
    timers.runAllTimers()
    expect(additions).toBe(0)
  })

  test('Implements the hot signer lifecycle contract without publishing through the store', async () => {
    await exerciseHotSignerContract(signer, vault.acquireKey(PASSWORD))
    expect(store.getState().main.signers[signer.id]).toBeUndefined()
  })
})
