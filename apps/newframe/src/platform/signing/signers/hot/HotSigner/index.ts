import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { Common, createCustomCommon, Holesky, Mainnet, Sepolia } from '@ethereumjs/common'
import { createTx } from '@ethereumjs/tx'
import { bytesToHex } from '@ethereumjs/util'
import { personalSign, recoverPersonalSignature, signTypedData } from '@metamask/eth-sig-util'
import { app } from 'electron'
import log from 'electron-log'

import type { TypedMessage } from '../../../../../features/requests/contract/requests.js'
import type { TransactionData } from '../../../../../features/transactions/domain/index.js'
import Signer from '../../Signer/index.js'

export type VaultAccess = { getKey(): string | null }

const electronApp = app as typeof app | undefined
const USER_DATA = electronApp
  ? electronApp.getPath('userData')
  : path.resolve(import.meta.dirname, '../.userData')
const SIGNERS_PATH = path.resolve(USER_DATA, 'signers')
const knownChains: Record<number, any> = { 1: Mainnet, 17000: Holesky, 11155111: Sepolia }

function chainConfig(chain: number, hardfork: string) {
  return chain in knownChains
    ? new Common({ chain: knownChains[chain], hardfork })
    : createCustomCommon({ chainId: chain }, Mainnet, { hardfork })
}

abstract class HotSigner extends Signer {
  network?: string

  constructor(
    signer: { id?: string; addresses?: string[]; network?: string } | undefined,
    protected readonly vault: VaultAccess
  ) {
    super()
    this.status = 'ok'
    this.id = signer?.id ?? ''
    this.addresses = signer?.addresses ?? []
    this.network = signer?.network
  }

  protected abstract openPrivateKey(index: number, vaultKeyHex: string): Buffer
  protected abstract persistedSecret(): Record<string, unknown>

  save() {
    const { id, addresses, type, network } = this
    const signer = { version: 1, id, addresses, type, network, ...this.persistedSecret() }
    fs.mkdirSync(SIGNERS_PATH, { recursive: true })
    const signerPath = path.resolve(SIGNERS_PATH, `${id}.json`)
    fs.writeFileSync(signerPath, JSON.stringify(signer), { mode: 0o600 })
    fs.chmodSync(signerPath, 0o600)
    log.debug('Signer saved to disk')
  }

  override delete() {
    const signerPath = path.resolve(SIGNERS_PATH, `${this.id}.json`)
    if (fs.existsSync(signerPath)) {
      fs.writeFileSync(signerPath, '0'.repeat(72), { mode: 0o600 })
      fs.rmSync(signerPath, { force: true })
    }
    log.info('Signer erased from disk')
  }

  override close() {
    log.info('Signer closed')
  }

  override update() {
    const derivedId = this.fingerprint()
    if (!derivedId) {
      if (this.id) {
        this.save()
      }
      this.emit('update')
      return
    }
    if (!this.id) {
      this.id = derivedId
      this.save()
    } else if (this.id !== derivedId) {
      this.delete()
      this.id = derivedId
      this.save()
    } else {
      this.save()
    }
    this.emit('update')
    log.info('Signer updated')
  }

  private withPrivateKey<T>(index: number, cb: Callback<T>, operation: (key: Buffer) => T) {
    const vaultKey = this.vault.getKey()
    if (!vaultKey) {
      return cb(new Error('Signer locked'), undefined)
    }

    let key: Buffer | undefined
    let result: T
    try {
      key = this.openPrivateKey(index, vaultKey)
      result = operation(key)
    } catch (error) {
      return cb(error as Error, undefined)
    } finally {
      key?.fill(0)
    }
    cb(null, result)
  }

  override signMessage(index: number, message: string, cb: Callback<string>) {
    this.withPrivateKey(index, cb, (privateKey) => personalSign({ privateKey, data: message }))
  }

  override signTypedData(index: number, typedMessage: TypedMessage, cb: Callback<string>) {
    this.withPrivateKey(index, cb, (privateKey) => {
      const { data, version } = typedMessage
      return signTypedData({ privateKey, data, version })
    })
  }

  override signTransaction(index: number, rawTx: TransactionData, cb: Callback<string>) {
    this.withPrivateKey(index, cb, (privateKey) => {
      if (!rawTx.chainId) {
        throw new Error('could not determine chain id for transaction')
      }
      const chainId = Number.parseInt(String(rawTx.chainId), 16)
      const hardfork = Number.parseInt(String(rawTx.type)) === 2 ? 'london' : 'berlin'
      const tx = createTx(rawTx as any, { common: chainConfig(chainId, hardfork) })
      return bytesToHex(tx.sign(privateKey).serialize())
    })
  }

  exportPrivateKey(index: number, cb: Callback<string>) {
    this.withPrivateKey(index, cb, (key) => `0x${key.toString('hex')}`)
  }

  override verifyAddress(
    index: number,
    address: string,
    _display: boolean,
    cb: Callback<boolean> = () => {}
  ) {
    this.withPrivateKey(
      index,
      (error, verified) => {
        if (error || !verified) {
          const failure = error ?? new Error('Unable to verify address')
          this.emit('lockApp')
          log.error('HotSigner verifyAddress: Unable to verify address', failure)
          cb(failure, undefined)
          return
        }
        log.info('Hot signer verify address matched')
        cb(null, true)
      },
      (privateKey) => {
        const message = `0x${randomBytes(32).toString('hex')}`
        const signature = personalSign({ privateKey, data: message })
        if (Buffer.from(signature.replace('0x', ''), 'hex').length !== 65) {
          throw new Error('Newframe verifyAddress signature has incorrect length')
        }
        return recoverPersonalSignature({ data: message, signature }).toLowerCase() === address.toLowerCase()
      }
    )
  }
}

export default HotSigner
