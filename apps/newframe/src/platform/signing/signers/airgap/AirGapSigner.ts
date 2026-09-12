import { randomUUID } from 'node:crypto'
import {
  recoverPersonalSignature,
  recoverTypedSignature,
  SignTypedDataVersion,
  TypedDataUtils
} from '@metamask/eth-sig-util'
import { bytesToHex } from '@ethereumjs/util'
import { encodePersonalSignMessage } from '../../../../features/connections/main/provider/helpers.js'
import Signer, { type SignerRequestContext } from '../Signer/index.js'
import type canonicalStore from '../../../state-store/index.js'
import type { OperationOwner } from '../../../operations/types.js'
import {
  AirGapPublicAccountSchema,
  type AirGapPublicAccount,
  type AirGapRequestReference
} from '../../domain/airgap.js'
import type {
  TypedMessage,
  CanonicalAccountRequest
} from '../../../../features/requests/contract/requests.js'
import type { TransactionData } from '../../../../features/transactions/domain/index.js'
import { sign, createUnsignedTransaction } from '../../../../features/transactions/main/index.js'
import {
  airGapId,
  deriveAirGapAddresses,
  AirGapUrAssembler,
  chainNumber,
  DataType,
  decodeSignature,
  requestFrames,
  transactionPreimage
} from './protocol.js'

type Pending = {
  sessionId: string
  context: SignerRequestContext
  address: string
  chainId: number
  kind: DataType
  frames: string[]
  decoder: AirGapUrAssembler
  verifying: boolean
  active(): boolean
  cleanup: Array<() => void>
  verify(response: Buffer): Promise<string>
  callback: Callback<string>
}
const ownerMatches = (a: OperationOwner, b: OperationOwner) =>
  a.clientType === b.clientType && a.windowInstanceId === b.windowInstanceId
const requestIdentity = (request: CanonicalAccountRequest) => {
  const fields = request as CanonicalAccountRequest & { data?: unknown; typedMessage?: unknown }
  return JSON.stringify([
    fields.handlerId,
    fields.type,
    fields.account,
    fields.payload,
    fields.data,
    fields.typedMessage,
    fields.authorization
  ])
}
const cancelled = () => new Error('AirGap signing cancelled')

export default class AirGapSigner extends Signer {
  readonly record: AirGapPublicAccount
  private pending?: Pending
  private closed = false
  constructor(
    record: AirGapPublicAccount,
    private readonly store: typeof canonicalStore
  ) {
    super()
    this.record = Object.freeze(AirGapPublicAccountSchema.parse(record))
    this.id = airGapId(this.record)
    this.type = 'airgap'
    this.name = this.record.name
    this.model = 'AirGap Vault'
    this.addresses = deriveAirGapAddresses(this.record)
    this.status = 'ok'
  }
  override summary() {
    return {
      ...super.summary(),
      ...(this.pending
        ? {
            airgapRequest: {
              requestId: this.pending.context.requestId,
              sessionId: this.pending.sessionId,
              progress: this.pending.verifying ? 1 : this.pending.decoder.progress
            }
          }
        : {})
    }
  }
  override verifyAddress(index: number, current: string, _display: boolean, cb: Callback<boolean>) {
    const match =
      Number.isInteger(index) &&
      index >= 0 &&
      index < this.addresses.length &&
      this.addresses[index].toLowerCase() === current.toLowerCase()
    cb(match ? null : new Error('AirGap address does not match'), match)
  }
  override close() {
    this.closed = true
    if (this.pending) this.finish(this.pending, cancelled())
  }
  private approved(index: number, context?: SignerRequestContext) {
    if (this.closed || !context || !context.isOwnerActive() || context.owner.clientType !== 'wallet-ui')
      throw new Error('AirGap requires an active approving wallet window')
    if (this.pending) throw new Error('AirGap already has a pending request')
    if (!Number.isInteger(index) || index < 0 || index >= this.addresses.length)
      throw new Error('Invalid AirGap address index')
    const main = this.store.getState().main
    const address = this.addresses[index].toLowerCase()
    const account = main.accounts[main.currentAccount]
    const request = account?.requests[context.requestId] as CanonicalAccountRequest | undefined
    if (
      main.appLock.locked ||
      !account ||
      account.id.toLowerCase() !== address ||
      account.profileId !== main.currentProfile ||
      account.signer !== this.id ||
      !main.signers[this.id] ||
      !request ||
      request.status !== 'pending' ||
      request.authorization?.decision !== 'prompt'
    )
      throw cancelled()
    return { context, address, account, request, profileId: main.currentProfile }
  }
  private begin(
    index: number,
    context: SignerRequestContext | undefined,
    chainId: number,
    kind: DataType,
    preimage: Buffer,
    verify: (response: Buffer, sessionId: string) => Promise<string>,
    callback: Callback<string>
  ) {
    const approved = this.approved(index, context)
    const identity = requestIdentity(approved.request)
    const sessionId = randomUUID()
    const pending: Pending = {
      sessionId,
      context: approved.context,
      address: approved.address,
      chainId,
      kind,
      frames: requestFrames(
        this.record,
        index,
        sessionId,
        chainId,
        kind,
        Buffer.from(preimage),
        approved.address
      ),
      decoder: new AirGapUrAssembler('eth-signature'),
      verifying: false,
      cleanup: [],
      callback,
      verify: (response) => verify(response, sessionId),
      active: () => {
        const main = this.store.getState().main
        const account = main.accounts[approved.account.id]
        const request = account?.requests[approved.context.requestId] as CanonicalAccountRequest | undefined
        return (
          this.pending === pending &&
          !this.closed &&
          approved.context.isOwnerActive() &&
          !main.appLock.locked &&
          main.currentAccount === approved.account.id &&
          main.currentProfile === approved.profileId &&
          account?.profileId === approved.profileId &&
          account?.signer === this.id &&
          Boolean(main.signers[this.id]) &&
          request?.status === 'pending' &&
          requestIdentity(request) === identity
        )
      }
    }
    this.pending = pending
    const onChange = () => {
      if (!pending.active()) this.finish(pending, cancelled())
    }
    // Subscribing may synchronously discover an already-destroyed owner.
    const disposed = approved.context.subscribeOwnerDisposed(() => this.finish(pending, cancelled()))
    if (this.pending !== pending) {
      disposed()
      return
    }
    pending.cleanup.push(
      disposed,
      this.store.subscribe((state) => state.main, onChange)
    )
    onChange()
    if (this.pending === pending) this.emit('update')
  }
  private finish(pending: Pending, error: Error | null, value?: string) {
    if (this.pending !== pending) return
    this.pending = undefined
    pending.cleanup.splice(0).forEach((dispose) => dispose())
    this.emit('update')
    pending.callback(error, value)
  }
  private lookup(reference: AirGapRequestReference, owner: OperationOwner) {
    const pending = this.pending
    if (
      !pending ||
      reference.signerId !== this.id ||
      reference.requestId !== pending.context.requestId ||
      reference.sessionId !== pending.sessionId ||
      !ownerMatches(owner, pending.context.owner)
    )
      return
    if (!pending.active()) {
      this.finish(pending, cancelled())
      return
    }
    return pending
  }
  getRequest(reference: AirGapRequestReference, owner: OperationOwner) {
    const pending = this.lookup(reference, owner)
    return pending ? [...pending.frames] : undefined
  }
  cancelRequest(reference: AirGapRequestReference, owner: OperationOwner) {
    const pending = this.lookup(reference, owner)
    if (!pending) return false
    this.finish(pending, cancelled())
    return true
  }
  async scan(reference: AirGapRequestReference, owner: OperationOwner, frame: string) {
    const pending = this.lookup(reference, owner)
    if (!pending) return false
    if (pending.verifying) return true
    let response: Buffer | undefined
    try {
      response = pending.decoder.receive(frame)
    } catch (error) {
      this.emit('update')
      throw error
    }
    if (!response) {
      this.emit('update')
      return true
    }
    pending.verifying = true
    this.emit('update')
    try {
      const result = await pending.verify(response)
      // Keep the exact exchange alive through asynchronous transaction reconstruction.
      if (!pending.active()) {
        this.finish(pending, cancelled())
        return false
      }
      this.finish(pending, null, result)
      return true
    } catch {
      if (!pending.active()) {
        this.finish(pending, cancelled())
        return false
      }
      pending.verifying = false
      pending.decoder.reset()
      this.emit('update')
      throw new Error('AirGap response does not match the approved request. Scan again.')
    }
  }
  override signMessage(index: number, message: string, cb: Callback<string>, context?: SignerRequestContext) {
    try {
      const approved = this.approved(index, context)
      if (approved.request.type !== 'sign' || !/^0x(?:[0-9a-fA-F]{2})*$/.test(message))
        throw new Error('Invalid AirGap personal message')
      if (message !== encodePersonalSignMessage(approved.request.payload.params[1]))
        throw new Error('Message differs from approved request')
      const frozen = message
      const chainId = chainNumber(this.store.getState().main.origins[approved.request.origin]?.chain.id ?? 1)
      this.begin(
        index,
        context,
        chainId,
        DataType.personalMessage,
        Buffer.from(frozen.slice(2), 'hex'),
        async (response, sessionId) => {
          const { signature } = decodeSignature(response, sessionId, DataType.personalMessage, chainId)
          if (recoverPersonalSignature({ data: frozen, signature }).toLowerCase() !== approved.address)
            throw new Error('Wrong signing account')
          return signature
        },
        cb
      )
    } catch (error) {
      cb(error as Error)
    }
  }
  override signTypedData(
    index: number,
    message: TypedMessage,
    cb: Callback<string>,
    context?: SignerRequestContext
  ) {
    try {
      const approved = this.approved(index, context)
      if (
        !['signTypedData', 'signErc20Permit'].includes(approved.request.type) ||
        message.version !== SignTypedDataVersion.V4 ||
        Array.isArray(message.data)
      )
        throw new Error('AirGap supports EIP-712 V4 only')
      if (
        JSON.stringify(message) !==
        JSON.stringify(
          (approved.request as CanonicalAccountRequest & { typedMessage?: TypedMessage }).typedMessage
        )
      )
        throw new Error('Typed data differs from approved request')
      const { types, primaryType, domain, message: values } = structuredClone(message.data)
      const data = { types, primaryType, domain, message: values }
      // Compute the exact digest before producing any QR, including nested/array validation.
      TypedDataUtils.eip712Hash(data, SignTypedDataVersion.V4)
      const chainId = chainNumber(
        domain.chainId ?? this.store.getState().main.origins[approved.request.origin]?.chain.id ?? 1
      )
      this.begin(
        index,
        context,
        chainId,
        DataType.typedData,
        Buffer.from(JSON.stringify(data), 'utf8'),
        async (response, sessionId) => {
          const { signature } = decodeSignature(response, sessionId, DataType.typedData, chainId)
          if (
            recoverTypedSignature({ data, version: SignTypedDataVersion.V4, signature }).toLowerCase() !==
            approved.address
          )
            throw new Error('Wrong signing account')
          return signature
        },
        cb
      )
    } catch (error) {
      cb(error as Error)
    }
  }
  override signTransaction(
    index: number,
    rawTx: TransactionData,
    cb: Callback<string>,
    context?: SignerRequestContext
  ) {
    try {
      const approved = this.approved(index, context)
      if (approved.request.type !== 'transaction') throw new Error('Not an approved transaction')
      if (
        JSON.stringify(rawTx) !==
        JSON.stringify((approved.request as CanonicalAccountRequest & { data?: TransactionData }).data)
      )
        throw new Error('Transaction differs from approved request')
      const frozen = structuredClone(rawTx)
      const chainId = chainNumber(frozen.chainId)
      if (frozen.from?.toLowerCase() !== approved.address) throw new Error('Wrong signing account')
      const tx = createUnsignedTransaction(frozen)
      const kind = tx.type === 0 ? DataType.transaction : DataType.typedTransaction
      const preimage = transactionPreimage(tx)
      this.begin(
        index,
        context,
        chainId,
        kind,
        preimage,
        async (response, sessionId) => {
          const signature = decodeSignature(response, sessionId, kind, chainId)
          const signed = await sign(frozen, async () => signature)
          if (
            !signed.verifySignature() ||
            signed.getSenderAddress().toString().toLowerCase() !== approved.address
          )
            throw new Error('Wrong signing account')
          return bytesToHex(signed.serialize())
        },
        cb
      )
    } catch (error) {
      cb(error as Error)
    }
  }
}
