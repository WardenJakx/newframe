import { afterAll, afterEach, beforeAll, describe, expect, jest as timers, mock, test } from 'bun:test'

import path from 'path'
import fs from 'fs'
import { rm } from 'fs/promises'
import { Mnemonic, randomBytes } from 'ethers'
import log from 'electron-log'
import { createHotSignerChildProcessMock } from '../../../../test/support/bun.mocks.ts'
import { electronMock } from '../../../../test/support/electron.mock.ts'

mock.module('child_process', () => createHotSignerChildProcessMock())

const PASSWORD = 'fr@///3_password'
const SIGNER_PATH = path.resolve(import.meta.dirname, '../.userData/signers')
const VAULT_PATH = path.resolve(import.meta.dirname, '../.userData/vault.json')

// Stubs
const signers = { add: mock() }
// Util
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

  afterEach(() => {
    timers.useRealTimers()
  })

  afterAll(async () => {
    await clean()
    if (signer.status !== 'locked') {
      signer.close()
    }
    log.transports.console.level = 'debug'
  })

  test('Create from invalid phrase', (done) => {
    const mnemonic = 'invalid mnemonic'

    try {
      hot.createFromPhrase(vault, signers, mnemonic, PASSWORD, (err: any) => {
        expect(err).toBeTruthy()
        expect(store.getState().main.signers).toEqual({})
        done()
      })
    } catch (e) {
      done(e)
    }
  }, 1000)

  test('Create from phrase', (done) => {
    try {
      const mnemonic = Mnemonic.fromEntropy(randomBytes(16)).phrase
      hot.createFromPhrase(vault, signers, mnemonic, PASSWORD, (err: any, result: any) => {
        signer = result
        expect(err).toBe(null)
        expect(signer.status).toBe('ok')
        expect(signer.addresses.length).toBe(100)
        expect(signers.add).toHaveBeenCalledWith(signer)
        expect(store.getState().main.signers).toEqual({})
        const storedSigner = JSON.parse(
          fs.readFileSync(path.resolve(SIGNER_PATH, `${signer.id}.json`), 'utf8')
        )
        expect(storedSigner.encryptionVersion).toBe(undefined)
        done()
      })
    } catch (e) {
      done(e)
    }
  }, 7_500)

  test('Lock', (done) => {
    try {
      signer.lock((err: any) => {
        expect(err).toBe(null)
        expect(signer.status).toBe('locked')
        done()
      })
    } catch (e) {
      done(e)
    }
  }, 2000)

  test('Scan for signers', (done) => {
    timers.useFakeTimers()

    let count = 0
    const signers = {
      add: (signer: any) => {
        signer.close(() => {})
        if (signer.type === 'seed') count++
        expect(count).toBe(1)
        done()
      },
      exists: () => false
    }

    hot.scan(signers)

    timers.runAllTimers()
  }, 800)

  test('Cancel delayed scan', () => {
    timers.useFakeTimers()
    const delayedSigners = { add: mock(), exists: () => false }
    const scheduledScan = hot.scan(delayedSigners)

    scheduledScan.cancel()
    timers.runAllTimers()

    expect(delayedSigners.add).not.toHaveBeenCalled()
  })

  test('Unlock with wrong password', (done) => {
    try {
      signer.unlock('Wrong password', (err: any) => {
        expect(err).toBeTruthy()
        expect(signer.status).toBe('locked')
        done()
      })
    } catch (e) {
      done(e)
    }
  }, 2000)

  test('Unlock', (done) => {
    try {
      // signers are encrypted with the vault key, unlocked via the master password
      signer.unlock(vault.acquireKey(PASSWORD), (err: any) => {
        expect(err).toBe(null)
        done()
      })
    } catch (e) {
      done(e)
    }
  }, 500)

  test('Sign message', (done) => {
    try {
      const message = '0x' + Buffer.from('test').toString('hex')

      signer.signMessage(0, message, (err: any, result: any) => {
        expect(err).toBe(null)
        expect(result.length).toBe(132)
        done()
      })
    } catch (e) {
      done(e)
    }
  }, 500)

  test('Sign transaction', (done) => {
    const rawTx = {
      nonce: '0x6',
      gasPrice: '0x09184e72a000',
      gasLimit: '0x30000',
      to: '0xfa3caabc8eefec2b5e2895e5afbf79379e7268a7',
      value: '0x0',
      chainId: '0x1'
    }

    try {
      signer.signTransaction(0, rawTx, (err: any, result: any) => {
        expect(err).toBe(null)
        expect(result.length).not.toBe(0)
        expect(result.slice(0, 2)).toBe('0x')
        done()
      })
    } catch (e) {
      done(e)
    }
  }, 500)

  test('Verify address', (done) => {
    try {
      signer.verifyAddress(0, signer.addresses[0], false, (err: any, result: any) => {
        expect(err).toBe(null)
        expect(result).toBe(true)
        done()
      })
    } catch (e) {
      done(e)
    }
  }, 500)

  test('Verify wrong address', (done) => {
    try {
      signer.verifyAddress(0, '0xabcdef', false, (err: any, result: any) => {
        expect(err.message).toBe('Unable to verify address')
        expect(result).toBe(undefined)
        done()
      })
    } catch (e) {
      done(e)
    }
  }, 500)

  test('Sign message when locked', (done) => {
    try {
      signer.signMessage(0, 'test', (err: any) => {
        expect(err.message).toBe('Signer locked')
        done()
      })
    } catch (e) {
      done(e)
    }
  })

  test('Close signer', (done) => {
    try {
      signer.close()
      expect(store.getState().main.signers[signer.id]).toBe(undefined)
      done()
    } catch (e) {
      done(e)
    }
  })
})
