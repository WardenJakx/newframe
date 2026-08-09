import { afterAll, afterEach, beforeAll, describe, expect, jest as timers, mock, test } from 'bun:test'

import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { rm } from 'fs/promises'
import log from 'electron-log'
import { createHotSignerChildProcessMock } from '../../../../../../test/support/bun.mocks.ts'
import { electronMock } from '../../../../../../test/support/electron.mock.ts'
import { callbackResult, exerciseHotSignerContract } from '../../callback.test-support.ts'

mock.module('child_process', () => createHotSignerChildProcessMock())

const PASSWORD = 'fr@///3_password'
const SIGNER_PATH = path.resolve(import.meta.dirname, '../.userData/signers')
const VAULT_PATH = path.resolve(import.meta.dirname, '../.userData/vault.json')
const FILE_PATH = path.resolve(import.meta.dirname, 'keystore.test-fixture.json')
const addedSigners: any[] = []
const signers = { add: (signer: any) => addedSigners.push(signer) }
const removePath = (target: string) => rm(target, { recursive: true, force: true })
const clean = () => Promise.all([removePath(SIGNER_PATH), removePath(VAULT_PATH)])
const readKeystore = () => JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'))

let hot: any, store: any, vault: any

describe('Ring signer', () => {
  let signer: any

  beforeAll(async () => {
    log.transports.console.level = false
    electronMock.app.getPath.mockReturnValue(path.resolve(import.meta.dirname, '../.userData'))
    await clean()
    hot = await import('..')
    store = (await import('../../../../state-store')).default
    vault = (await import('../../../../secrets/vault')).default
  })

  afterEach(() => timers.useRealTimers())
  afterAll(async () => {
    await clean()
    if (signer.status !== 'locked') signer.close()
    log.transports.console.level = 'debug'
  })

  test('Rejects invalid private keys and keystores', async () => {
    await expect(
      callbackResult((done) => hot.createFromPrivateKey(vault, signers, 'invalid key', PASSWORD, done))
    ).rejects.toBeTruthy()
    await expect(
      callbackResult((done) =>
        hot.createFromKeystore(vault, signers, { invalid: 'keystore' }, 'test', PASSWORD, done)
      )
    ).rejects.toBeTruthy()
    expect(store.getState().main.signers).toEqual({})
  })

  test('Creates from a private key without persisting the legacy encryption version', async () => {
    const privateKey = '0x' + crypto.randomBytes(32).toString('hex')
    signer = await callbackResult((done) =>
      hot.createFromPrivateKey(vault, signers, privateKey, PASSWORD, done)
    )
    expect(signer).toMatchObject({ status: 'ok' })
    expect(signer.id).toBeDefined()
    expect(signer.addresses[0]).toBe(signer.addresses[0].toLowerCase())
    expect(addedSigners.at(-1)).toBe(signer)
    expect(store.getState().main.signers).toEqual({})
    const stored = JSON.parse(fs.readFileSync(path.resolve(SIGNER_PATH, `${signer.id}.json`), 'utf8'))
    expect(stored.encryptionVersion).toBeUndefined()
  }, 7_500)

  test('Scans for one ring signer', async () => {
    timers.useFakeTimers()
    const found = callbackResult<any>((done) => {
      hot.scan({ add: (value: any) => done(null, value), exists: () => false })
      timers.runAllTimers()
    })
    const scanned = await found
    expect(scanned.type).toBe('ring')
    scanned.close(() => {})
  })

  test('Closes a signer without publishing through the canonical store', () => {
    signer.close()
    expect(store.getState().main.signers[signer.id]).toBeUndefined()
  })

  test('Creates from a keystore', async () => {
    signer = await callbackResult((done) =>
      hot.createFromKeystore(vault, signers, readKeystore(), 'test', PASSWORD, done)
    )
    expect(signer).toMatchObject({ status: 'ok' })
    expect(signer.id).toBeDefined()
    expect(signer.addresses[0]).toBe(signer.addresses[0].toLowerCase())
  })

  test('Adds and removes private keys and keystores', async () => {
    await callbackResult((done) =>
      signer.addPrivateKey(crypto.randomBytes(32).toString('hex'), vault.acquireKey(PASSWORD), done)
    )
    expect(signer.addresses).toHaveLength(2)
    const secondAddress = signer.addresses[1]
    await callbackResult((done) => signer.removePrivateKey(0, vault.acquireKey(PASSWORD), done))
    expect(signer.addresses).toEqual([secondAddress])
    await callbackResult((done) => signer.removePrivateKey(0, vault.acquireKey(PASSWORD), done))
    const previousLength = signer.addresses.length
    await callbackResult((done) =>
      signer.addKeystore(readKeystore(), 'test', vault.acquireKey(PASSWORD), done)
    )
    expect(signer.addresses).toHaveLength(previousLength + 1)
  })

  test('Implements the hot signer lifecycle contract', async () => {
    await exerciseHotSignerContract(signer, vault.acquireKey(PASSWORD))
  })
})
