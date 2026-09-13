import type {
  SafeApprovalCommand,
  SafeConfirmationStatus,
  SafeConfirmationStatusQuery
} from '../../../app/contracts/operations.js'
import type { OperationService } from '../../../platform/operations/service.js'
import type { OperationOwner, OperationReference } from '../../../platform/operations/types.js'
import {
  getSafeTypedMessage,
  serviceCalldataMismatch,
  verifySafeConfirmation,
  verifySafeHash
} from '../../../platform/safe/integrity.js'
import type { SigningUiContext } from '../../../platform/signing/signers/Signer/index.js'
import type { CanonicalStoreReader } from '../../../platform/state-store/actions.js'
import type { TypedMessage } from '../../requests/contract/requests.js'
import { safeConfigurationSchema, safeProposalSchema } from '../domain/safe.js'
import type FrameAccount from './Account.js'

export interface SafeConfirmationPorts {
  store: CanonicalStoreReader
  operations: OperationService
  accounts: { getFrameAccount(id: string): Pick<FrameAccount, 'signTypedData'> | null }
  client: {
    confirmations(
      chainId: number,
      hash: string,
      signal?: AbortSignal
    ): Promise<{ owner: string; signature: string }[]>
    confirm(chainId: number, hash: string, signature: string, signal?: AbortSignal): Promise<void>
  }
}
type Identity = Pick<SafeApprovalCommand, 'accountId' | 'chainId' | 'safeTxHash' | 'ownerId'>
type Terminal = Exclude<SafeConfirmationStatus['status'], 'idle' | 'signing' | 'publishing'>
type Snapshot = { fingerprint: string; typedMessage: TypedMessage; ownerAddress: string }
type Entry = {
  identity: Identity
  anchor: string
  snapshot?: Snapshot
  status: SafeConfirmationStatus['status']
  phase: string
  message?: string
  signature?: string
  references: OperationReference[]
  controller: AbortController
  context: SigningUiContext
  cleanup: () => void
  running: boolean
}
const normalize = (input: Identity): Identity => ({
  accountId: input.accountId.toLowerCase(),
  chainId: input.chainId,
  safeTxHash: input.safeTxHash.toLowerCase(),
  ownerId: input.ownerId.toLowerCase()
})
const keyOf = (identity: Identity) => JSON.stringify(identity)
const cancelledMessage = 'Confirmation cancelled. Review the proposal before trying again.'
function isRejected(error: unknown) {
  const value = error && typeof error === 'object' ? (error as { code?: unknown; message?: unknown }) : {}
  return (
    value.code === 4001 ||
    value.code === 'ACTION_REJECTED' ||
    (typeof value.message === 'string' &&
      /cancelled|canceled|rejected by user|user rejected|user denied/i.test(value.message))
  )
}

export function createSafeConfirmationService({
  store,
  operations,
  accounts,
  client
}: SafeConfirmationPorts) {
  const entries = new Map<string, Entry>()
  const accepted = new Map<string, string>()
  let disposed = false
  const anchor = (identity: Identity) => {
    const main = store.getState().main
    return JSON.stringify([
      main.currentProfile,
      main.accounts[identity.accountId]?.created,
      main.accounts[identity.ownerId]?.created
    ])
  }
  const snapshot = (identity: Identity): Snapshot => {
    const main = store.getState().main
    const safe = main.accounts[identity.accountId]
    const owner = main.accounts[identity.ownerId]
    const deployment = safe?.safe?.[String(identity.chainId)]
    if (!safe || safe.profileId !== main.currentProfile || !deployment)
      throw new Error('Safe deployment is unavailable in this profile.')
    if (!owner || owner.profileId !== main.currentProfile || owner.safe)
      throw new Error('Owner account is unavailable in this profile.')
    if (
      deployment.chainId !== identity.chainId ||
      deployment.address.toLowerCase() !== safe.address.toLowerCase()
    )
      throw new Error('Safe deployment does not match this account and chain.')
    const configuration = safeConfigurationSchema.parse(deployment.configuration)
    if (!configuration.owners.some((address) => address.toLowerCase() === owner.address.toLowerCase()))
      throw new Error('Selected account is not an owner of this Safe on this chain.')
    const network = main.networks.ethereum[identity.chainId]
    if (!network?.on) throw new Error('Chain is unavailable.')
    const candidate = deployment.pending?.find(
      (item) => item.safeTxHash.toLowerCase() === identity.safeTxHash
    )
    if (!candidate) throw new Error('Safe proposal is no longer available.')
    const proposal = safeProposalSchema.parse(candidate)
    if (proposal.integrity?.status === 'mismatch' || serviceCalldataMismatch(proposal))
      throw new Error('Proposal integrity does not match its transaction fields.')
    if (proposal.safe.toLowerCase() !== deployment.address.toLowerCase())
      throw new Error('Proposal belongs to another Safe.')
    if (BigInt(proposal.nonce) < BigInt(configuration.nonce))
      throw new Error('Safe proposal has already been executed or replaced.')
    if (
      verifySafeHash(proposal, identity.chainId, deployment.address, configuration.version).status !==
      'matched'
    )
      throw new Error('Proposal fields or signing domain could not be verified.')
    const typedMessage = getSafeTypedMessage(
      proposal,
      identity.chainId,
      deployment.address,
      configuration.version
    )
    return {
      ownerAddress: owner.address,
      typedMessage,
      fingerprint: JSON.stringify([
        anchor(identity),
        safe.profileId,
        safe.address,
        deployment.address,
        deployment.chainId,
        owner.profileId,
        owner.address,
        configuration.version,
        network,
        typedMessage
      ])
    }
  }
  const semanticValid = (entry: Entry) => {
    try {
      return snapshot(entry.identity).fingerprint === entry.snapshot?.fingerprint
    } catch {
      return false
    }
  }
  const usable = (entry: Entry) => {
    if (disposed || entry.controller.signal.aborted || !entry.context.isOwnerActive()) return false
    const main = store.getState().main
    if (main.appLock.locked || main.currentAccount !== entry.identity.accountId) return false
    return semanticValid(entry)
  }
  const finish = (entry: Entry, status: Terminal, message?: string) => {
    if (!entry.running) return
    entry.running = false
    entry.status = status
    entry.phase = status
    entry.message = message
    entry.cleanup()
    for (const reference of entry.references) {
      if (status === 'published') operations.complete(reference, status)
      else
        operations.fail(
          reference,
          { code: status, message: message || 'Could not confirm this proposal.' },
          status
        )
    }
    if (status !== 'published' && entry.references[0])
      entry.message =
        operations.lookup(entry.references[0])?.error?.message || 'Could not confirm this proposal.'
  }
  const cancel = (entry: Entry, discard = false) => {
    entry.cleanup()
    if (discard) entry.signature = undefined
    entry.controller.abort()
    if (entry.running)
      finish(
        entry,
        entry.signature ? 'publication_failed' : 'cancelled',
        entry.signature ? 'Publication interrupted. Retry uses the saved confirmation.' : cancelledMessage
      )
    else if (discard && entry.status !== 'validation_failed') {
      entry.status = 'cancelled'
      entry.phase = 'cancelled'
      entry.message = cancelledMessage
    }
  }
  const advance = (entry: Entry, phase: 'signing' | 'publishing' | 'reconciling') => {
    entry.status = phase === 'signing' ? 'signing' : 'publishing'
    entry.phase = phase
    for (const reference of entry.references) operations.advance(reference, { phase })
  }
  const assertActive = (entry: Entry) => {
    if (!usable(entry)) {
      cancel(entry, !semanticValid(entry))
      throw new Error(cancelledMessage)
    }
  }
  const wait = async <T>(entry: Entry, promise: Promise<T>): Promise<T> => {
    let onAbort!: () => void
    const aborted = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(new Error(cancelledMessage))
      entry.controller.signal.addEventListener('abort', onAbort, { once: true })
      if (entry.controller.signal.aborted) onAbort()
    })
    try {
      const result = await Promise.race([promise, aborted])
      assertActive(entry)
      return result
    } finally {
      entry.controller.signal.removeEventListener('abort', onAbort)
    }
  }
  const reconcile = async (entry: Entry) => {
    assertActive(entry)
    advance(entry, 'reconciling')
    const values = await wait(
      entry,
      client.confirmations(entry.identity.chainId, entry.identity.safeTxHash, entry.controller.signal)
    )
    return values.some(
      ({ owner, signature }) =>
        owner.toLowerCase() === entry.snapshot?.ownerAddress.toLowerCase() &&
        verifySafeConfirmation(entry.identity.safeTxHash, owner, signature)
    )
  }
  const published = (entry: Entry) => {
    assertActive(entry)
    // Only a verified service read can add the owner to the cached queue display.
    const main = store.getState().main
    const account = main.accounts[entry.identity.accountId]
    const deployment = account.safe![String(entry.identity.chainId)]
    const address = entry.snapshot!.ownerAddress
    store.getState().patchAccount(entry.identity.accountId, {
      safe: {
        ...account.safe,
        [String(entry.identity.chainId)]: {
          ...deployment,
          pending: deployment.pending?.map((proposal) =>
            proposal.safeTxHash.toLowerCase() !== entry.identity.safeTxHash
              ? proposal
              : {
                  ...proposal,
                  confirmations: proposal.confirmations.some(
                    (owner) => owner.toLowerCase() === address.toLowerCase()
                  )
                    ? proposal.confirmations
                    : [...proposal.confirmations, address]
                }
          )
        }
      }
    })
    finish(entry, 'published')
    entry.signature = undefined
  }
  const run = async (entry: Entry) => {
    try {
      if (await reconcile(entry)) {
        published(entry)
        return
      }
      if (!entry.signature) {
        assertActive(entry)
        advance(entry, 'signing')
        const signature = await wait(
          entry,
          new Promise<string>((resolve, reject) => {
            const account = accounts.getFrameAccount(entry.identity.ownerId)
            if (!account) throw new Error('Owner account is unavailable.')
            account.signTypedData(
              structuredClone(entry.snapshot!.typedMessage),
              (error, signature) => {
                if (error) reject(error)
                else if (!signature) reject(new Error('Wallet returned no confirmation.'))
                else resolve(signature)
              },
              {
                requestId: entry.references[0]!.id,
                chainId: entry.identity.chainId,
                signal: entry.controller.signal,
                isActive: () => usable(entry),
                ui: entry.context
              }
            )
          })
        )
        if (!verifySafeConfirmation(entry.identity.safeTxHash, entry.snapshot!.ownerAddress, signature))
          throw new Error('Wallet returned an invalid confirmation.')
        entry.signature = signature
      }
      assertActive(entry)
      advance(entry, 'publishing')
      // A failed or uncertain POST may still have committed. Always read stored bytes afterward.
      try {
        await wait(
          entry,
          client.confirm(
            entry.identity.chainId,
            entry.identity.safeTxHash,
            entry.signature,
            entry.controller.signal
          )
        )
      } catch {
        assertActive(entry)
      }
      if (await reconcile(entry)) published(entry)
      else
        finish(
          entry,
          'publication_failed',
          'The service has not stored a valid confirmation from this owner. Try again.'
        )
    } catch (error) {
      if (!entry.running) return
      if (!usable(entry)) {
        cancel(entry, !semanticValid(entry))
        return
      }
      const signingFailure = entry.phase === 'signing'
      if (signingFailure && isRejected(error)) {
        finish(entry, 'cancelled', 'Owner cancelled the confirmation.')
        return
      }
      if (!signingFailure && !entry.signature) {
        finish(
          entry,
          'signing_failed',
          'Could not check existing confirmation. No signing was requested. Try again.'
        )
        return
      }
      finish(
        entry,
        signingFailure ? 'signing_failed' : 'publication_failed',
        signingFailure
          ? error instanceof Error && error.message.length <= 256
            ? error.message
            : 'Owner wallet could not confirm. Try again.'
          : 'Could not verify the stored confirmation. Try again; any completed signing will be reused.'
      )
    }
  }
  const addReference = (entry: Entry, reference: OperationReference) => {
    if (
      entry.references.some(
        (item) => item.id === reference.id && item.owner.windowInstanceId === reference.owner.windowInstanceId
      )
    )
      return true
    if (operations.lookup(reference)) return false
    try {
      operations.start({ ...reference, phase: entry.phase })
    } catch {
      return false
    }
    entry.references.push(reference)
    if (!entry.running) {
      if (entry.status === 'published') operations.complete(reference, 'published')
      else
        operations.fail(
          reference,
          { code: entry.status, message: entry.message || 'Could not confirm this proposal.' },
          entry.status
        )
    }
    return true
  }
  const unsubscribe = store.subscribe(
    (state) => state.main,
    () => {
      for (const entry of entries.values()) {
        if (entry.snapshot && !semanticValid(entry)) cancel(entry, true)
        else if (entry.running && !usable(entry)) cancel(entry)
      }
    }
  )
  return {
    confirm(command: SafeApprovalCommand, context: SigningUiContext) {
      if (disposed || context.owner.clientType !== 'wallet-ui' || !context.isOwnerActive()) return false
      const identity = normalize(command)
      const key = keyOf(identity)
      const reference = { id: command.operationId, type: 'account.safe-confirm', owner: context.owner }
      const previous = entries.get(key)
      const requestKey = JSON.stringify([context.owner, command.operationId])
      if (operations.lookup(reference)) return accepted.get(requestKey) === key
      if (
        previous &&
        previous.anchor === anchor(identity) &&
        (previous.running || previous.status === 'published')
      ) {
        const added = addReference(previous, reference)
        if (added) accepted.set(requestKey, key)
        return added
      }
      let captured: Snapshot | undefined
      let validationError: unknown
      try {
        if (
          store.getState().main.currentAccount !== identity.accountId ||
          store.getState().main.appLock.locked
        )
          throw new Error('Select this Safe and unlock Newframe before confirming.')
        captured = snapshot(identity)
      } catch (error) {
        validationError = error
      }
      const entry: Entry = {
        identity,
        anchor: anchor(identity),
        snapshot: captured,
        status: 'publishing',
        phase: 'reconciling',
        references: [],
        controller: new AbortController(),
        context,
        cleanup: () => {},
        running: true,
        ...(captured && previous?.snapshot?.fingerprint === captured.fingerprint && previous.signature
          ? { signature: previous.signature }
          : {})
      }
      if (!addReference(entry, reference)) return false
      accepted.set(requestKey, key)
      previous?.cleanup()
      entries.set(key, entry)
      if (!captured) {
        finish(
          entry,
          'validation_failed',
          validationError instanceof Error && validationError.message.length <= 256
            ? validationError.message
            : 'Proposal could not be validated. Refresh and review it again.'
        )
        return true
      }
      entry.cleanup = context.subscribeOwnerDisposed(() => cancel(entry))
      if (entry.running) void run(entry)
      return true
    },
    confirmationStatus(query: SafeConfirmationStatusQuery, owner?: OperationOwner): SafeConfirmationStatus {
      const identity = normalize(query)
      const entry = entries.get(keyOf(identity))
      if (!entry || entry.anchor !== anchor(identity)) return { status: 'idle' }
      const candidate = owner
        ? entry.references.findLast(
            (item) =>
              item.owner.clientType === owner.clientType &&
              item.owner.windowInstanceId === owner.windowInstanceId
          )
        : entry.references.at(-1)
      const reference =
        candidate && operations.lookup(candidate)?.phase === entry.phase ? candidate : undefined
      return {
        status: entry.status,
        ...(reference ? { operationId: reference.id } : {}),
        ...(entry.message ? { message: entry.message } : {})
      }
    },
    dispose() {
      disposed = true
      unsubscribe()
      for (const entry of entries.values()) cancel(entry, true)
      entries.clear()
      accepted.clear()
    }
  }
}
