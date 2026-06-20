import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import log from 'electron-log'
import { Mnemonic, randomBytes } from 'ethers'

import crypt from '../../crypt'
import vault from '../../vault'

import SeedSigner from './SeedSigner'
import RingSigner from './RingSigner'
import { stripHexPrefix } from '@ethereumjs/util'

type Callback = (err: Error | null, result?: any) => void

const USER_DATA = app
  ? app.getPath('userData')
  : path.resolve(path.dirname(require.main!.filename), '../.userData')
const SIGNERS_PATH = path.resolve(USER_DATA, 'signers')

const wait = async (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export const newPhrase = (cb: Callback) => {
  cb(null, Mnemonic.fromEntropy(randomBytes(16)).phrase)
}

// All new hot signers are encrypted with the vault key. The password argument
// is the Newframe master password; it creates the vault on first use, unlocks it
// if it's locked and is ignored when the vault is already unlocked
const acquireVaultKey = (password: string, cb: Callback): string | undefined => {
  try {
    return vault.acquireKey(password)
  } catch (e) {
    cb(e as Error)
  }
}

export const createFromSeed = (signers: any, seed: string, password: string, cb: Callback) => {
  if (!seed) return cb(new Error('Seed required to create hot signer'))
  const vaultKey = acquireVaultKey(password, cb)
  if (!vaultKey) return
  const signer = new SeedSigner({ encryptionVersion: 2 })
  signer.addSeed(seed, vaultKey, (err: Error | null, result?: any) => {
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
  const vaultKey = acquireVaultKey(password, cb)
  if (!vaultKey) return
  const signer = new SeedSigner({ encryptionVersion: 2 })
  signer.addPhrase(phrase, vaultKey, (err) => {
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
  const vaultKey = acquireVaultKey(password, cb)
  if (!vaultKey) return
  const signer = new RingSigner({ encryptionVersion: 2 })

  signer.addPrivateKey(privateKeyHex, vaultKey, (err) => {
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
  const vaultKey = acquireVaultKey(password, cb)
  if (!vaultKey) return
  const signer = new RingSigner({ encryptionVersion: 2 })
  signer.addKeystore(keystore, keystorePassword, vaultKey, (err) => {
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
    fs.mkdirSync(SIGNERS_PATH, { recursive: true })

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
      const { addresses, encryptedKeys, encryptedSeed, type, network, encryptionVersion } = storedSigners[id]
      if (addresses && addresses.length) {
        const id = crypt.stringToKey(addresses.join()).toString('hex')
        if (!signers.exists(id)) {
          if (type === 'seed') {
            signers.add(new SeedSigner({ network, addresses, encryptedSeed, encryptionVersion }))
          } else if (type === 'ring') {
            signers.add(new RingSigner({ network, addresses, encryptedKeys, encryptionVersion }))
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
