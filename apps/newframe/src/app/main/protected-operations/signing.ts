import { isValidAddress } from '@ethereumjs/util'

import type { AccountsRuntime } from '../../../features/accounts/main/runtime.js'
import type { TypedMessage } from '../../../features/requests/contract/requests.js'
import type { TransactionData } from '../../../features/transactions/domain/index.js'
import { createOneResultCallbackBoundary } from '../../../platform/callbacks/oneResult.js'
import { getSignerType, isSignerReady } from '../../../platform/signing/domain/index.js'
import type Signer from '../../../platform/signing/signers/Signer/index.js'
import type {
  SigningApprovalContext,
  SignerRequestContext
} from '../../../platform/signing/signers/Signer/index.js'
import type { CanonicalStore, CanonicalStoreReader } from '../../../platform/state-store/actions.js'
import type { Callback } from '../../../shared/domain/async.js'

/** Account-scoped signer execution, owned by the protected operations service. */
export class ProtectedAccountSigning {
  private closed = false
  private readonly signingCancellations = new Set<() => void>()
  private readonly address: string
  constructor(
    private readonly id: string,
    private readonly store: CanonicalStoreReader,
    private readonly runtime: AccountsRuntime
  ) {
    this.address = id
  }
  close() {
    this.closed = true
    for (const cancel of this.signingCancellations) {
      cancel()
    }
  }
  private dispatchSigning<T>(
    payload: T,
    cb: Callback<string>,
    approval: SigningApprovalContext | undefined,
    invoke: (
      signer: Signer,
      index: number,
      value: T,
      done: Callback<string>,
      context?: SignerRequestContext
    ) => void
  ) {
    let signer: Signer | undefined
    let index: number
    let value: T
    const captured = this.store.getState().main.accounts[this.id] as
      | CanonicalStore['main']['accounts'][string]
      | undefined
    const cancelled = () =>
      Object.assign(new Error('Signing cancelled because its approval is no longer active.'), { code: 4001 })
    const validate = () => {
      const main = this.store.getState().main
      const owner = (main.accounts as Record<string, CanonicalStore['main']['accounts'][string] | undefined>)[
        this.id
      ]
      if (owner?.safe) {
        throw new Error('Safe accounts are read-only')
      }
      if (
        this.closed ||
        !captured ||
        !owner ||
        owner.created !== captured.created ||
        owner.profileId !== captured.profileId ||
        owner.profileId !== main.currentProfile ||
        owner.address.toLowerCase() !== this.address ||
        owner.signer !== captured.signer
      ) {
        throw cancelled()
      }
      if (main.appLock.locked) {
        throw new Error('Unlock Newframe before signing.')
      }
      if (
        approval &&
        (approval.signal?.aborted || !approval.isActive() || (approval.ui && !approval.ui.isOwnerActive()))
      ) {
        throw cancelled()
      }
      const currentSigner = this.runtime.signers.get(owner.signer)
      const summary = (main.signers as Record<string, CanonicalStore['main']['signers'][string] | undefined>)[
        owner.signer
      ]
      if (!currentSigner || !summary || !getSignerType(currentSigner.type.toLowerCase())) {
        throw new Error('No signer attached.')
      }
      if (!isSignerReady(currentSigner) || !isSignerReady(summary)) {
        throw new Error('Connect and unlock the signer before signing.')
      }
      const currentIndex = currentSigner.addresses.findIndex(
        (address) => address.toLowerCase() === this.address
      )
      if (
        currentIndex < 0 ||
        !summary.addresses.some((address: string) => address.toLowerCase() === this.address)
      ) {
        throw new Error('Signer cannot sign for this address')
      }
      if (signer && (signer !== currentSigner || index !== currentIndex)) {
        throw cancelled()
      }
      return { signer: currentSigner, index: currentIndex }
    }
    try {
      ;({ signer, index } = validate())
      if (!approval) {
        throw new Error('Signing requires operation approval or an AI session')
      }
      value = structuredClone(payload)
    } catch (error) {
      cb(error as Error)
      return
    }
    const boundary = createOneResultCallbackBoundary()
    const controller = new AbortController()
    const cancel = () => {
      controller.abort()
      boundary.dispose()
    }
    const unsubscribe = this.store.subscribe(
      (state) => state.main,
      () => {
        try {
          validate()
        } catch {
          cancel()
        }
      }
    )
    this.signingCancellations.add(cancel)
    approval.signal?.addEventListener('abort', cancel, { once: true })
    const unsubscribeUi = approval.ui?.subscribeOwnerDisposed(cancel)
    const context = approval.ui
      ? {
          ...approval.ui,
          requestId: approval.requestId,
          accountId: this.id,
          chainId: approval.chainId,
          signal: controller.signal
        }
      : undefined
    void boundary
      .run<string>((done) => {
        validate()
        if (controller.signal.aborted) {
          throw cancelled()
        }
        invoke(signer, index, value, done, context)
      })
      .then(
        (result) => {
          try {
            validate()
            if (controller.signal.aborted) {
              throw cancelled()
            }
          } catch (error) {
            cb(error as Error)
            return
          }
          cb(null, result)
        },
        (error: unknown) => cb(controller.signal.aborted ? cancelled() : (error as Error))
      )
      .finally(() => {
        unsubscribe()
        unsubscribeUi?.()
        approval.signal?.removeEventListener('abort', cancel)
        this.signingCancellations.delete(cancel)
        boundary.dispose()
      })
  }

  signMessage(message: string, cb: Callback<string>, context?: SigningApprovalContext) {
    if (!message) {
      return cb(new Error('No message to sign'))
    }
    this.dispatchSigning(message, cb, context, (signer, index, value, done, approval) =>
      signer.signMessage(index, value, done, approval)
    )
  }

  signTypedData(typedMessage: TypedMessage, cb: Callback<string>, context?: SigningApprovalContext) {
    if (typeof typedMessage.data !== 'object') {
      return cb(new Error('Data to sign has the wrong format'))
    }
    this.dispatchSigning(typedMessage, cb, context, (signer, index, value, done, approval) =>
      signer.signTypedData(index, value, done, approval)
    )
  }

  signTransaction(rawTx: TransactionData, cb: Callback<string>, context?: SigningApprovalContext) {
    if (this.store.getState().main.accounts[this.id]?.safe) {
      return cb(new Error('Safe accounts are read-only'))
    }
    this.validateTransaction(rawTx, (err) => {
      if (err) {
        return cb(err)
      }
      this.dispatchSigning(rawTx, cb, context, (signer, index, value, done, approval) =>
        signer.signTransaction(index, value, done, approval)
      )
    })
  }

  private validateTransaction(rawTx: TransactionData, cb: Callback<void>) {
    // Validate 'from' address
    if (!rawTx.from) {
      return cb(new Error("Missing 'from' address"))
    }
    if (!isValidAddress(rawTx.from)) {
      return cb(new Error("Invalid 'from' address"))
    }

    if (rawTx.from.toLowerCase() !== this.address) {
      return cb(new Error('Transaction belongs to another account'))
    }

    // Ensure that transaction params are valid hex strings
    const enforcedKeys: Array<keyof TransactionData> = [
      'value',
      'data',
      'to',
      'from',
      'gas',
      'gasPrice',
      'gasLimit',
      'nonce'
    ]
    const keys = Object.keys(rawTx) as Array<keyof TransactionData>

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      if (enforcedKeys.indexOf(key) > -1 && !this.isValidHexString(rawTx[key] as string)) {
        return cb(new Error(`Transaction parameter '${String(key)}' is not a valid hex string`))
      }
    }
    return cb(null)
  }

  private isValidHexString(str: string) {
    const pattern = /^0x[0-9a-fA-F]*$/
    return pattern.test(str)
  }
}
