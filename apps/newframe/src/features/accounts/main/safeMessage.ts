import { SignTypedDataVersion } from '@metamask/eth-sig-util'

import {
  getSafeMessageHash,
  getSafeMessageTypedData,
  packSafeMessageSignatures,
  verifySafeMessageConfirmation,
  type VerifiedSafeMessageConfirmation
} from '../../../platform/safe/integrity.js'
import {
  getOriginalMessageDigest,
  type OriginalMessage
} from '../../../platform/signing/signatures/digests.js'
import type { SigningUiContext } from '../../../platform/signing/signers/Signer/index.js'
import type { CanonicalStore, CanonicalStoreReader } from '../../../platform/state-store/actions.js'
import type { SignatureRequest, SafeMessageProgress } from '../../requests/contract/requests.js'
import { isTypedMessageSignatureRequest } from '../../requests/domain/index.js'
import type { SafeConfiguration } from '../domain/safe.js'
import type FrameAccount from './Account.js'
import { deriveSigningCandidate } from './signingCapability.js'

export type SafeMessageApprovalResult = { status: 'pending' } | { status: 'complete'; signature: string }

type SafeServiceMessage = {
  safe: string
  messageHash: string
  message: OriginalMessage
  confirmations: VerifiedSafeMessageConfirmation[]
  preparedSignature: string
}

export interface SafeMessagePorts {
  store: CanonicalStoreReader
  accounts: {
    getFrameAccount(id: string): Pick<FrameAccount, 'getRequest' | 'patchRequest' | 'signTypedData'> | null
  }
  client: {
    configuration(chainId: number, address: string, signal?: AbortSignal): Promise<SafeConfiguration>
    createMessage(
      chainId: number,
      address: string,
      message: OriginalMessage,
      signature: string,
      configuration: SafeConfiguration,
      signal?: AbortSignal
    ): Promise<string>
    getMessage(
      chainId: number,
      address: string,
      hash: string,
      configuration: SafeConfiguration,
      signal?: AbortSignal
    ): Promise<SafeServiceMessage>
    confirmMessage(
      chainId: number,
      hash: string,
      signature: string,
      owners: readonly string[],
      signal?: AbortSignal
    ): Promise<void>
    validateMessage(
      chainId: number,
      address: string,
      hash: string,
      signature: string,
      signal?: AbortSignal
    ): Promise<boolean>
  }
  clock?: { delay(ms: number, signal?: AbortSignal): Promise<void> }
}

type Entry = {
  requestId: string
  accountId: string
  chainId: number
  safeAddress: string
  original: OriginalMessage
  originalKey: string
  hash: string
  configuration: SafeConfiguration
  fingerprint: string
  signatures: Map<string, VerifiedSafeMessageConfirmation>
  controller: AbortController
  settled: boolean
}

const configurationFingerprint = (configuration: SafeConfiguration) =>
  JSON.stringify([
    configuration.version,
    configuration.threshold,
    configuration.owners.map((owner) => owner.toLowerCase())
  ])

const messageKey = (message: OriginalMessage) => JSON.stringify(message)

function personalMessage(request: SignatureRequest) {
  const raw = request.payload.params[1]
  if (typeof raw !== 'string' || !raw) {
    throw new Error('Safe message request is missing its message.')
  }
  if (/^0x(?:[0-9a-f]{2})*$/i.test(raw)) {
    return raw
  }
  return `0x${Buffer.from(raw, 'utf8').toString('hex')}`
}

function originalMessage(request: SignatureRequest): OriginalMessage {
  return isTypedMessageSignatureRequest(request)
    ? structuredClone(request.typedMessage)
    : personalMessage(request)
}

function sameServiceMessage(expected: OriginalMessage, actual: OriginalMessage) {
  if (typeof expected === 'string' || typeof actual === 'string') {
    return expected === actual
  }
  return JSON.stringify(expected.data) === JSON.stringify(actual.data)
}

function abortableDelay(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    const abort = () => {
      clearTimeout(timer)
      reject(signal?.reason ?? new Error('Safe message signing cancelled.'))
    }
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) {
      abort()
    }
  })
}

export function createSafeMessageService({ store, accounts, client, clock }: SafeMessagePorts) {
  const entries = new Map<string, Entry>()
  const ownerActions = new Map<string, Promise<SafeMessageApprovalResult>>()
  let disposed = false
  const delay = clock ? (ms: number, signal?: AbortSignal) => clock.delay(ms, signal) : abortableDelay
  const accountState = (accountId: string) =>
    (
      store.getState().main.accounts as Record<string, CanonicalStore['main']['accounts'][string] | undefined>
    )[accountId]

  const requestState = (entry: Entry) =>
    accountState(entry.accountId)?.requests[entry.requestId] as SignatureRequest | undefined

  const active = (entry: Entry) =>
    !disposed && !entry.controller.signal.aborted && !entry.settled && Boolean(requestState(entry))

  const patchProgress = (entry: Entry, progress: SafeMessageProgress) => {
    accounts.getFrameAccount(entry.accountId)?.patchRequest<SignatureRequest>(entry.requestId, (request) => {
      request.safeMessageProgress = progress
    })
  }

  const progress = (entry: Entry, status: SafeMessageProgress['status'], message?: string) => {
    patchProgress(entry, {
      status,
      messageHash: entry.hash,
      threshold: entry.configuration.threshold,
      confirmations: [...entry.signatures.values()].map(({ owner }) => owner),
      ...(message ? { message: message.slice(0, 256) } : {})
    })
  }

  const cancel = (entry: Entry, message = 'Safe message signing cancelled.') => {
    if (entry.controller.signal.aborted) {
      return
    }
    entry.controller.abort(new Error(message))
    if (!entry.settled && requestState(entry)) {
      progress(entry, 'cancelled', message)
    }
  }

  const freshConfiguration = async (entry: Entry) => {
    const configuration = await client.configuration(
      entry.chainId,
      entry.safeAddress,
      entry.controller.signal
    )
    if (configurationFingerprint(configuration) !== entry.fingerprint) {
      cancel(entry, 'Safe owners, threshold, or version changed. Review the request again.')
      throw new Error('Safe owners, threshold, or version changed. Review the request again.')
    }
    return configuration
  }

  const validateAggregate = async (entry: Entry, signature: string) => {
    await freshConfiguration(entry)
    return client.validateMessage(
      entry.chainId,
      entry.safeAddress,
      getOriginalMessageDigest(entry.original),
      signature,
      entry.controller.signal
    )
  }

  const reconcile = async (entry: Entry): Promise<string | undefined> => {
    const configuration = await freshConfiguration(entry)
    const remote = await client.getMessage(
      entry.chainId,
      entry.safeAddress,
      entry.hash,
      configuration,
      entry.controller.signal
    )
    if (
      remote.safe.toLowerCase() !== entry.safeAddress.toLowerCase() ||
      remote.messageHash.toLowerCase() !== entry.hash.toLowerCase() ||
      !sameServiceMessage(entry.original, remote.message)
    ) {
      throw new Error('Safe service returned a different message.')
    }
    for (const confirmation of remote.confirmations) {
      const verified = verifySafeMessageConfirmation(entry.hash, configuration.owners, confirmation)
      entry.signatures.set(verified.owner.toLowerCase(), verified)
    }
    if (remote.preparedSignature && (await validateAggregate(entry, remote.preparedSignature))) {
      return remote.preparedSignature
    }
  }

  const localAggregate = async (entry: Entry): Promise<string | undefined> => {
    const configuration = await freshConfiguration(entry)
    const confirmations = [...entry.signatures.values()].filter(({ owner }) =>
      configuration.owners.some((candidate) => candidate.toLowerCase() === owner.toLowerCase())
    )
    if (confirmations.length < configuration.threshold) {
      return
    }
    const signature = packSafeMessageSignatures(entry.hash, configuration.owners, confirmations)
    return (await validateAggregate(entry, signature)) ? signature : undefined
  }

  const complete = (entry: Entry, signature: string): SafeMessageApprovalResult => {
    entry.settled = true
    progress(entry, 'complete')
    return { status: 'complete', signature }
  }

  const publish = async (entry: Entry, signature: string, first: boolean) => {
    if (first) {
      await client.createMessage(
        entry.chainId,
        entry.safeAddress,
        entry.original,
        signature,
        entry.configuration,
        entry.controller.signal
      )
    } else {
      await client.confirmMessage(
        entry.chainId,
        entry.hash,
        signature,
        entry.configuration.owners,
        entry.controller.signal
      )
    }
  }

  const run = async (
    entry: Entry,
    ownerId: string,
    context: SigningUiContext
  ): Promise<SafeMessageApprovalResult> => {
    if (!active(entry) || !context.isOwnerActive()) {
      throw new Error('Safe message approval is no longer active.')
    }
    const configuration = await freshConfiguration(entry)
    const main = store.getState().main
    const owner = accountState(ownerId)
    if (!owner || owner.profileId !== main.currentProfile || owner.safe) {
      throw new Error('Selected Safe owner is unavailable in this profile.')
    }
    if (!configuration.owners.some((address) => address.toLowerCase() === owner.address.toLowerCase())) {
      throw new Error('Selected account is not an owner of this Safe on this chain.')
    }
    const candidate = deriveSigningCandidate(owner, main.signers, main.appLock, SignTypedDataVersion.V4)
    if (candidate.status !== 'ready') {
      throw new Error(candidate.signerStatus)
    }

    const request = requestState(entry)
    if (!request) {
      throw new Error('Safe message request is no longer active.')
    }
    const v1 =
      isTypedMessageSignatureRequest(request) && request.typedMessage.version === SignTypedDataVersion.V1
    if (v1) {
      const localEligible = configuration.owners.filter((address) =>
        Object.values(main.accounts).some((account) => {
          if (account.safe || account.profileId !== main.currentProfile) {
            return false
          }
          if (account.address.toLowerCase() !== address.toLowerCase()) {
            return false
          }
          return deriveSigningCandidate(account, main.signers, { locked: false }, SignTypedDataVersion.V4)
            .signerAttached
        })
      )
      if (localEligible.length < configuration.threshold) {
        throw new Error(
          'Safe V1 signing cannot be coordinated because local eligible owners cannot meet the threshold.'
        )
      }
    } else {
      try {
        const remote = await reconcile(entry)
        if (remote) {
          return complete(entry, remote)
        }
      } catch {
        // Service coordination is optional. Local owners can still reach threshold.
      }
    }

    const ownerKey = owner.address.toLowerCase()
    if (!entry.signatures.has(ownerKey)) {
      await freshConfiguration(entry)
      const typedMessage = getSafeMessageTypedData(
        getOriginalMessageDigest(entry.original),
        entry.chainId,
        entry.safeAddress,
        entry.configuration.version
      )
      const signature = await new Promise<string>((resolve, reject) => {
        const frame = accounts.getFrameAccount(ownerId)
        if (!frame) {
          return reject(new Error('Selected Safe owner is unavailable.'))
        }
        frame.signTypedData(
          typedMessage,
          (error, value) =>
            error || !value ? reject(error ?? new Error('Owner returned no signature.')) : resolve(value),
          {
            requestId: entry.requestId,
            chainId: entry.chainId,
            signal: entry.controller.signal,
            isActive: () => active(entry) && context.isOwnerActive(),
            ui: context
          }
        )
      })
      await freshConfiguration(entry)
      const verified = verifySafeMessageConfirmation(entry.hash, configuration.owners, { signature })
      if (verified.owner.toLowerCase() !== owner.address.toLowerCase()) {
        throw new Error('Owner returned a signature for another account.')
      }
      entry.signatures.set(ownerKey, verified)
      progress(entry, 'collecting')
    }

    let publicationFailed = false
    if (!v1) {
      try {
        await publish(entry, entry.signatures.get(ownerKey)!.signature, entry.signatures.size === 1)
      } catch {
        publicationFailed = true
        // Keep the verified local signature. A failed POST may still have committed.
      }
    }

    const local = await localAggregate(entry)
    if (local) {
      return complete(entry, local)
    }

    if (!v1) {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const remote = await reconcile(entry)
          if (remote) {
            return complete(entry, remote)
          }
        } catch {
          // Keep the dapp request pending during a service outage.
        }
        if (attempt < 2) {
          await delay(250 * (attempt + 1), entry.controller.signal)
        }
      }
    }
    progress(
      entry,
      publicationFailed ? 'failed' : 'collecting',
      publicationFailed ? 'Safe service publication failed. Retry this owner approval.' : undefined
    )
    return { status: 'pending' }
  }

  const createEntry = async (request: SignatureRequest) => {
    const safe = accountState(request.account)
    const deployment = safe?.safe?.[String(request.chainId)]
    if (!safe || !deployment) {
      throw new Error('Safe deployment is unavailable on the connected chain.')
    }
    const controller = new AbortController()
    const configuration = await client.configuration(request.chainId, deployment.address, controller.signal)
    const original = originalMessage(request)
    const hash = getSafeMessageHash(original, request.chainId, deployment.address, configuration.version)
    const entry: Entry = {
      requestId: request.handlerId,
      accountId: request.account,
      chainId: request.chainId,
      safeAddress: deployment.address,
      original,
      originalKey: messageKey(original),
      hash,
      configuration,
      fingerprint: configurationFingerprint(configuration),
      signatures: new Map(),
      controller,
      settled: false
    }
    entries.set(request.handlerId, entry)
    progress(entry, 'collecting')
    return entry
  }

  const unsubscribe = store.subscribe(
    (state) => state.main.accounts,
    () => {
      for (const entry of entries.values()) {
        const request = requestState(entry)
        if (!request || messageKey(originalMessage(request)) !== entry.originalKey) {
          cancel(entry)
        }
      }
    }
  )

  return {
    async approve(
      request: SignatureRequest,
      ownerId: string,
      context: SigningUiContext
    ): Promise<SafeMessageApprovalResult> {
      if (disposed) {
        throw new Error('Safe message service is disposed.')
      }
      let entry = entries.get(request.handlerId)
      entry ??= await createEntry(request)
      if (entry.settled) {
        throw new Error('Safe message request is already complete.')
      }
      if (entry.originalKey !== messageKey(originalMessage(request))) {
        cancel(entry)
        throw new Error('Safe message request changed. Review it again.')
      }
      const key = `${request.handlerId}:${ownerId.toLowerCase()}`
      const existing = ownerActions.get(key)
      if (existing) {
        return existing
      }
      const action = run(entry, ownerId.toLowerCase(), context).finally(() => ownerActions.delete(key))
      ownerActions.set(key, action)
      return action
    },
    cancel(requestId: string) {
      const entry = entries.get(requestId)
      if (!entry) {
        return false
      }
      cancel(entry)
      entries.delete(requestId)
      return true
    },
    dispose() {
      disposed = true
      unsubscribe()
      for (const entry of entries.values()) {
        cancel(entry, 'Newframe is shutting down.')
      }
      entries.clear()
      ownerActions.clear()
    }
  }
}
