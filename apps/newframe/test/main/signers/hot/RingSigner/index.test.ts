import { afterAll, afterEach, beforeAll, describe, expect, jest as timers, mock, test } from 'bun:test'

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { rm } from 'fs/promises'
import log from 'electron-log'
import { createHotSignerChildProcessMock, electronMock } from '../../../../bun.mocks'

mock.module('child_process', () => createHotSignerChildProcessMock())

const PASSWORD = 'fr@///3_password'
const SIGNER_PATH = path.resolve(__dirname, '../.userData/signers')
const VAULT_PATH = path.resolve(__dirname, '../.userData/vault.json')
const FILE_PATH = path.resolve(__dirname, 'keystore.json')

// Stubs
const signers = { add: mock() }
// Util
const removePath = (target: string) => rm(target, { recursive: true, force: true })
const clean = () => Promise.all([removePath(SIGNER_PATH), removePath(VAULT_PATH)])

let hot: any, store: any, vault: any

describe('Ring signer', () => {
  let signer: any

  beforeAll(async () => {
    log.transports.console.level = false

    electronMock.app.getPath.mockReturnValue(path.resolve(__dirname, '../.userData'))
    await clean()

    hot = await import('../../../../../main/signers/hot')
    store = (await import('../../../../../main/store')).default
    vault = (await import('../../../../../main/vault')).default
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

  test('Create from invalid private key', (done) => {
    const privateKey = 'invalid key'

    try {
      hot.createFromPrivateKey(signers, privateKey, PASSWORD, (err: any) => {
        expect(err).toBeTruthy()
        expect(store.getState().main.signers).toEqual({})
        done()
      })
    } catch (e) {
      done(e)
    }
  }, 1000)

  test('Create from invalid keystore key', (done) => {
    const keystore = { invalid: 'keystore' }

    try {
      hot.createFromKeystore(signers, keystore, 'test', PASSWORD, (err: any) => {
        expect(err).toBeTruthy()
        expect(store.getState().main.signers).toEqual({})
        done()
      })
    } catch (e) {
      done(e)
    }
  }, 2000)

  test('Create from private key', (done) => {
    try {
      const privateKey = '0x' + crypto.randomBytes(32).toString('hex')
      hot.createFromPrivateKey(signers, privateKey, PASSWORD, (err: any, result: any) => {
        signer = result

        expect(err).toBe(null)
        expect(signer.status).toBe('ok')
        expect(signer.id).not.toBe(undefined)
        expect(signer.addresses[0]).toBe(signer.addresses[0].toLowerCase())
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

  test('Scan for signers', (done) => {
    timers.useFakeTimers()

    let count = 0
    const signers = {
      add: (signer: any) => {
        try {
          signer.close(() => {})
          if (signer.type === 'ring') count++
          expect(count).toBe(1)
          done()
        } catch (e) {
          done(e)
        }
      },
      exists: () => false
    }

    hot.scan(signers)

    timers.runAllTimers()
  }, 800)

  test('Close signer', (done) => {
    try {
      signer.close()
      expect(store.getState().main.signers[signer.id]).toBe(undefined)
      done()
    } catch (e) {
      done(e)
    }
  })

  test('Create from keystore', (done) => {
    try {
      const file = fs.readFileSync(FILE_PATH, 'utf8')
      const keystore = JSON.parse(file)
      hot.createFromKeystore(signers, keystore, 'test', PASSWORD, (err: any, result: any) => {
        signer = result
        expect(err).toBe(null)
        expect(signer.status).toBe('ok')
        expect(signer.id).not.toBe(undefined)
        expect(signer.addresses[0]).toBe(signer.addresses[0].toLowerCase())
        done()
      })
    } catch (e) {
      done(e)
    }
  }, 2000)

  test('Add private key', (done) => {
    try {
      const privateKey = crypto.randomBytes(32).toString('hex')
      // signer-level methods take the actual encryption secret, the vault key
      signer.addPrivateKey(privateKey, vault.acquireKey(PASSWORD), (err: any) => {
        expect(err).toBe(null)
        expect(signer.addresses.length).toBe(2)
        done()
      })
    } catch (e) {
      done(e)
    }
  }, 2000)

  test('Remove private key', (done) => {
    try {
      const secondAddress = signer.addresses[1]
      signer.removePrivateKey(0, vault.acquireKey(PASSWORD), (err: any) => {
        expect(err).toBe(null)
        expect(signer.addresses.length).toBe(1)
        expect(signer.addresses[0]).toEqual(secondAddress)
        done()
      })
    } catch (e) {
      done(e)
    }
  }, 2000)

  test('Remove last private key', (done) => {
    try {
      signer.removePrivateKey(0, vault.acquireKey(PASSWORD), (err: any) => {
        expect(err).toBe(null)
        done()
      })
    } catch (e) {
      done(e)
    }
  }, 2000)

  test('Add private key from keystore', (done) => {
    try {
      const file = fs.readFileSync(FILE_PATH, 'utf8')
      const keystore = JSON.parse(file)
      const previousLength = signer.addresses.length

      signer.addKeystore(keystore, 'test', vault.acquireKey(PASSWORD), (err: any) => {
        expect(err).toBe(null)
        expect(signer.addresses.length).toBe(previousLength + 1)
        done()
      })
    } catch (e) {
      done(e)
    }
  }, 2000)

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

  test('Unlock with wrong password', (done) => {
    try {
      signer.unlock('Wrong password', (err: any) => {
        expect(err).toBeTruthy()
        done()
      })
    } catch (e) {
      done(e)
    }
  }, 600)

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
      done()
    } catch (e) {
      done(e)
    }
  })
})
