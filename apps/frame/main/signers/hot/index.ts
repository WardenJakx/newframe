import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import log from 'electron-log'
import * as bip39 from 'bip39'
import zxcvbn from '../../../resources/zxcvbn'

import crypt from '../../crypt'

import SeedSigner from './SeedSigner'
import RingSigner from './RingSigner'
import { stripHexPrefix } from '@ethereumjs/util'

// fs-extra ships no type declarations; loaded via require to keep it untyped
const { ensureDirSync } = require('fs-extra')

type Callback = (err: Error | null, result?: any) => void

const USER_DATA = app
  ? app.getPath('userData')
  : path.resolve(path.dirname(require.main!.filename), '../.userData')
const SIGNERS_PATH = path.resolve(USER_DATA, 'signers')

const wait = async (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export const newPhrase = (cb: Callback) => {
  cb(null, bip39.generateMnemonic())
}

export const createFromSeed = (signers: any, seed: string, password: string, cb: Callback) => {
  if (!seed) return cb(new Error('Seed required to create hot signer'))
  if (!password) return cb(new Error('Password required to create hot signer'))
  if (password.length < 12) return cb(new Error('Hot account password is too short'))
  if (zxcvbn(password).score < 3) return cb(new Error('Hot account password is too weak'))
  const signer = new SeedSigner()
  signer.addSeed(seed, password, (err: Error | null, result?: any) => {
    if (err) {
      signer.close()
      return cb(err)
    }
    signers.add(signer)
    cb(null, signer)
  })
}

export const createFromPhrase = (signers: any, phrase: string, password: string, cb: Callback) => {
  if (!phrase) return cb(new Error('Phrase required to create hot signer'))
  if (!password) return cb(new Error('Password required to create hot signer'))
  if (password.length < 12) return cb(new Error('Hot account password is too short'))
  if (zxcvbn(password).score < 3) return cb(new Error('Hot account password is too weak'))
  const signer = new SeedSigner()
  signer.addPhrase(phrase, password, (err) => {
    if (err) {
      signer.close()
      return cb(err)
    }
    signers.add(signer)
    cb(null, signer)
  })
}

export const createFromPrivateKey = (signers: any, privateKey: string, password: string, cb: Callback) => {
  const privateKeyHex = stripHexPrefix(privateKey)

  if (!privateKeyHex) return cb(new Error('Private key required to create hot signer'))
  if (!password) return cb(new Error('Password required to create hot signer'))
  if (password.length < 12) return cb(new Error('Hot account password is too short'))
  if (zxcvbn(password).score < 3) return cb(new Error('Hot account password is too weak'))
  const signer = new RingSigner()

  signer.addPrivateKey(privateKeyHex, password, (err) => {
    if (err) {
      signer.close()
      return cb(err)
    }
    signers.add(signer)
    cb(null, signer)
  })
}

export const createFromKeystore = (
  signers: any,
  keystore: any,
  keystorePassword: string,
  password: string,
  cb: Callback
) => {
  if (!keystore) return cb(new Error('Keystore required'))
  if (!keystorePassword) return cb(new Error('Keystore password required'))
  if (!password) return cb(new Error('Password required to create hot signer'))
  if (password.length < 12) return cb(new Error('Hot account password is too short'))
  if (zxcvbn(password).score < 3) return cb(new Error('Hot account password is too weak'))
  const signer = new RingSigner()
  signer.addKeystore(keystore, keystorePassword, password, (err) => {
    if (err) {
      signer.close()
      return cb(err)
    }
    signers.add(signer)
    cb(null, signer)
  })
}

export const scan = (signers: any) => {
  const storedSigners: Record<string, any> = {}

  const scan = async () => {
    // Ensure signer directory exists
    ensureDirSync(SIGNERS_PATH)

    // Find stored signers, read them from disk and add them to storedSigners
    fs.readdirSync(SIGNERS_PATH).forEach((file) => {
      try {
        const signer = JSON.parse(fs.readFileSync(path.resolve(SIGNERS_PATH, file), 'utf8'))
        storedSigners[signer.id] = signer
      } catch (e) {
        log.error(`Corrupt signer file: ${file}`)
      }
    })

    // Add stored signers
    for (const id of Object.keys(storedSigners)) {
      await wait(100)
      const { addresses, encryptedKeys, encryptedSeed, type, network } = storedSigners[id]
      if (addresses && addresses.length) {
        const id = crypt.stringToKey(addresses.join()).toString('hex')
        if (!signers.exists(id)) {
          if (type === 'seed') {
            signers.add(new SeedSigner({ network, addresses, encryptedSeed }))
          } else if (type === 'ring') {
            signers.add(new RingSigner({ network, addresses, encryptedKeys }))
          }
        }
      }
    }
  }

  // Delay creating child process until after initial load
  setTimeout(scan, 4000)

  return scan
}

export default { newPhrase, createFromSeed, createFromPhrase, createFromPrivateKey, createFromKeystore, scan }
