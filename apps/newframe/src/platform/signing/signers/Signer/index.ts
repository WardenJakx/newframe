import EventEmitter from 'events'

import { addHexPrefix } from '@ethereumjs/util'
import log from 'electron-log'

import type { TypedMessage } from '../../../../features/requests/contract/requests.js'
import type { TransactionData } from '../../../../features/transactions/domain/index.js'
import type { OperationOwner } from '../../../operations/types.js'
import crypt from '../../crypt.js'
import type { AirGapPendingSummary } from '../../domain/airgap.js'
import { getSignerDisplayType } from '../../domain/index.js'
import { deriveHDAccounts } from './derive.js'

export interface SigningUiContext {
  owner: OperationOwner
  isOwnerActive(): boolean
  subscribeOwnerDisposed(onDispose: () => void): () => void
}
export interface SigningApprovalContext {
  requestId: string
  chainId: number
  isActive(): boolean
  signal?: AbortSignal
  ui?: SigningUiContext
}
export type SignerRequestContext = SigningUiContext & {
  requestId: string
  accountId: string
  chainId: number
  signal: AbortSignal
}

export interface SignerSummary {
  airgapRequest?: AirGapPendingSummary
  id: string
  name: string
  model: string
  type: string
  addresses: string[]
  status: string
  appVersion: AppVersion
}

export interface AppVersion {
  major: number
  minor: number
  patch: number
}

export default class Signer extends EventEmitter {
  id = ''
  type = ''
  name = ''
  status = ''
  coinbase = '0x'
  model = ''
  appVersion: AppVersion = { major: 0, minor: 0, patch: 0 }

  addresses: string[]

  constructor() {
    super()

    this.addresses = []
  }

  deriveHDAccounts(publicKey: string, chainCode: string, cb: Callback<string[]>) {
    deriveHDAccounts(publicKey, chainCode, cb)
  }

  fingerprint() {
    if (this.addresses.length) {
      return crypt.stringToKey(this.addresses.join()).toString('hex')
    }
  }

  getCoinbase(cb: Callback<string>) {
    cb(null, this.addresses[0].toString())
  }

  verifyAddress(index: number, current: string, display: boolean, cb: Callback<boolean>) {
    const err = new Error('Signer:' + this.type + ' did not implement verifyAddress method')
    log.error(err)
    cb(err, undefined)
  }

  summary(): SignerSummary {
    return {
      id: this.id,
      name: this.name || `${getSignerDisplayType(this)} signer`,
      type: this.type,
      model: this.model,
      addresses: this.addresses.map((addr) => addHexPrefix(addr.toString())),
      status: this.status,
      appVersion: this.appVersion || { major: 0, minor: 0, patch: 0 }
    }
  }

  open(_device?: unknown) {
    log.warn(`Signer: ${this.type} did not implement an open method`)
  }

  close() {
    log.warn(`Signer: ${this.type} did not implement a close method`)
  }

  delete() {
    log.warn(`Signer: ${this.type} did not implement a delete method`)
  }

  update(_options = {}) {
    log.warn(`Signer: ${this.type} did not implement an update method`)
  }

  signMessage(_index: number, _message: string, _cb: Callback<string>, _context?: SignerRequestContext) {
    log.warn(`Signer: ${this.type} did not implement a signMessage method`)
  }

  signTransaction(
    _index: number,
    _rawTx: TransactionData,
    _cb: Callback<string>,
    _context?: SignerRequestContext
  ) {
    log.warn(`Signer: ${this.type} did not implement a signTransaction method`)
  }

  signTypedData(
    index: number,
    typedMessage: TypedMessage,
    cb: Callback<string>,
    _context?: SignerRequestContext
  ) {
    return cb(new Error(`Signer: ${this.type} does not support eth_signTypedData`), undefined)
  }
}
