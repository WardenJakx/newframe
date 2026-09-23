import { Interface, ZeroAddress } from 'ethers'

import type {
  SafeApprovalCommand,
  SafeConfirmationStatus,
  SafeConfirmationStatusQuery
} from '../../../app/contracts/operations.js'
import type { OperationService } from '../../../platform/operations/service.js'
import type { OperationOwner } from '../../../platform/operations/types.js'
import {
  getSafeTypedMessage,
  packSafeSignatures,
  serviceCalldataMismatch,
  verifySafeConfirmation,
  verifySafeHash
} from '../../../platform/safe/integrity.js'
import type { SigningUiContext } from '../../../platform/signing/signers/Signer/index.js'
import type { CanonicalStore, CanonicalStoreReader } from '../../../platform/state-store/actions.js'
import type { TransactionApprovalAdjustments } from '../../transactions/domain/approval.js'
import { GasFeesSource, type TransactionData } from '../../transactions/domain/index.js'
import {
  safeConfigurationSchema,
  safeProposalSchema,
  type SafeConfiguration,
  type SafeProposal
} from '../domain/safe.js'
import type FrameAccount from './Account.js'
import { safeExecutorCandidates, safeOwnerCandidates } from './signingCapability.js'

const safeAbi = new Interface([
  'function execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes) payable returns (bool)'
])

export interface DetachedSafeTransactionInput {
  accountId: string
  chainId: number
  to: string
  value?: string
  data?: string
  operation?: 0 | 1
  origin?: string
  localDecoded?: SafeProposal['localDecoded']
}

export interface DetachedSafeTransaction {
  accountId: string
  chainId: number
  proposal: SafeProposal
}

export interface SafeTransactionProvider {
  prepare(
    accountId: string,
    transaction: Omit<RPC.SendTransaction.TxParams, 'from'> & { chainId: string }
  ): Promise<{
    transaction: TransactionData &
      Required<Pick<TransactionData, 'from' | 'to' | 'value' | 'data' | 'nonce' | 'gasLimit'>>
    warnings: string[]
  }>
  execute(
    accountId: string,
    reviewed: TransactionData,
    adjustments: TransactionApprovalAdjustments | undefined,
    context: SigningUiContext,
    requestId: string
  ): Promise<string>
}

export interface SafeTransactionClient {
  configuration(
    chainId: number,
    address: string,
    signal?: AbortSignal,
    blockTag?: string
  ): Promise<SafeConfiguration>
  propose(
    chainId: number,
    candidate: SafeProposal,
    confirmation: { owner?: string; signature: string },
    origin?: string,
    signal?: AbortSignal
  ): Promise<SafeProposal>
  transaction(
    chainId: number,
    safe: string,
    hash: string,
    configuration: SafeConfiguration,
    signal?: AbortSignal
  ): Promise<SafeProposal>
  confirmations(
    chainId: number,
    hash: string,
    signal?: AbortSignal
  ): Promise<Array<{ owner: string; signature: string }>>
  confirm(chainId: number, hash: string, signature: string, signal?: AbortSignal): Promise<void>
}

export interface SafeTransactionPorts {
  store: CanonicalStoreReader
  operations: OperationService
  accounts: {
    getFrameAccount(id: string): Pick<FrameAccount, 'signTypedData'> | null
  }
  client: SafeTransactionClient
  provider: SafeTransactionProvider
  now?: () => number
  submitted?: (result: { safeTxHash: string; outerTxHash: string }) => void
}

type Identity = Pick<SafeConfirmationStatusQuery, 'accountId' | 'chainId' | 'safeTxHash'>
type StatusEntry = {
  status: SafeConfirmationStatus['status']
  operationId?: string
  message?: string
  owner?: OperationOwner
}

const normalizeIdentity = (identity: Identity): Identity => ({
  accountId: identity.accountId.toLowerCase(),
  chainId: identity.chainId,
  safeTxHash: identity.safeTxHash.toLowerCase()
})
const keyOf = (identity: Identity) =>
  `${identity.accountId.toLowerCase()}:${identity.chainId}:${identity.safeTxHash.toLowerCase()}`
const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message.length <= 500 ? error.message : fallback

function signTypedData(
  account: Pick<FrameAccount, 'signTypedData'>,
  message: ReturnType<typeof getSafeTypedMessage>,
  context: SigningUiContext,
  requestId: string,
  chainId: number,
  signal: AbortSignal
) {
  return new Promise<string>((resolve, reject) => {
    account.signTypedData(
      structuredClone(message),
      (error, signature) => {
        if (error || !signature) {
          reject(error ?? new Error('Owner wallet returned no confirmation.'))
        } else {
          resolve(signature)
        }
      },
      {
        requestId,
        chainId,
        signal,
        isActive: () => !signal.aborted && context.isOwnerActive(),
        ui: context
      }
    )
  })
}

export function createSafeTransactionService({
  store,
  operations,
  accounts,
  client,
  provider,
  now = Date.now,
  submitted
}: SafeTransactionPorts) {
  const status = new Map<string, StatusEntry>()
  const approvalWork = new Map<string, Promise<void>>()
  const executionWork = new Map<string, Promise<string>>()
  const delivered = new Set<string>()
  let disposed = false
  const isDisposed = () => disposed

  const accountState = (accountId: string) =>
    (
      store.getState().main.accounts as Record<string, CanonicalStore['main']['accounts'][string] | undefined>
    )[accountId.toLowerCase()]

  const locate = (identity: Identity) => {
    const normalized = normalizeIdentity(identity)
    const account = accountState(normalized.accountId)
    const deployment = account?.safe?.[String(normalized.chainId)]
    const proposal = deployment?.pending?.find(
      (candidate) => candidate.safeTxHash.toLowerCase() === normalized.safeTxHash
    )
    if (!account || !deployment || !proposal) {
      throw new Error('Safe proposal is no longer available.')
    }
    return { identity: normalized, account, deployment, proposal: safeProposalSchema.parse(proposal) }
  }

  const replaceProposal = (identity: Identity, update: (proposal: SafeProposal) => SafeProposal) => {
    const { account, deployment } = locate(identity)
    store.getState().patchAccount(identity.accountId.toLowerCase(), {
      safe: {
        ...account.safe,
        [String(identity.chainId)]: {
          ...deployment,
          pending: deployment.pending?.map((proposal) =>
            proposal.safeTxHash.toLowerCase() === identity.safeTxHash.toLowerCase()
              ? safeProposalSchema.parse(update(safeProposalSchema.parse(proposal)))
              : proposal
          )
        }
      }
    })
  }

  const freshConfiguration = async (identity: Identity, signal?: AbortSignal) => {
    const { deployment } = locate(identity)
    const configuration = safeConfigurationSchema.parse(
      await client.configuration(identity.chainId, deployment.address, signal)
    )
    const account = accountState(identity.accountId)
    const current = account?.safe?.[String(identity.chainId)]
    if (!account || !current) {
      throw new Error('Safe deployment changed during validation.')
    }
    store.getState().patchAccount(identity.accountId.toLowerCase(), {
      safe: {
        ...account.safe,
        [String(identity.chainId)]: { ...current, configuration }
      }
    })
    return configuration
  }

  const assertProposal = (identity: Identity, configuration: SafeConfiguration) => {
    const { deployment, proposal } = locate(identity)
    if (proposal.safe !== deployment.address || BigInt(proposal.nonce) < BigInt(configuration.nonce)) {
      throw new Error('Safe proposal is stale or belongs to another Safe.')
    }
    if (
      serviceCalldataMismatch(proposal) ||
      verifySafeHash(proposal, identity.chainId, deployment.address, configuration.version).status !==
        'matched'
    ) {
      throw new Error('Safe proposal fields or signing domain changed.')
    }
    return proposal
  }

  const localize = (
    proposal: SafeProposal,
    publication: 'local' | 'published' = 'local'
  ): SafeProposal & { local: NonNullable<SafeProposal['local']> } => ({
    ...proposal,
    local: proposal.local ?? {
      createdAt: now(),
      confirmations: [],
      publication: { status: publication },
      execution: { status: 'idle' }
    }
  })

  const mergeVerifiedServiceState = async (
    identity: Identity,
    configuration: SafeConfiguration,
    signal?: AbortSignal
  ) => {
    const current = assertProposal(identity, configuration)
    const serviceProposal = await client.transaction(
      identity.chainId,
      current.safe,
      identity.safeTxHash,
      configuration,
      signal
    )
    const rawConfirmations = await client.confirmations(identity.chainId, identity.safeTxHash, signal)
    const verified = rawConfirmations.filter(
      ({ owner, signature }) =>
        configuration.owners.some((candidate) => candidate.toLowerCase() === owner.toLowerCase()) &&
        verifySafeConfirmation(identity.safeTxHash, owner, signature)
    )
    replaceProposal(identity, (candidate) => {
      const proposal = localize(candidate, 'published')
      const confirmations = new Map(
        proposal.local.confirmations.map((confirmation) => [confirmation.owner.toLowerCase(), confirmation])
      )
      verified.forEach((confirmation) => confirmations.set(confirmation.owner.toLowerCase(), confirmation))
      return {
        ...proposal,
        confirmations: [
          ...new Set(
            [...serviceProposal.confirmations, ...confirmations.values()].map((item) =>
              typeof item === 'string' ? item : item.owner
            )
          )
        ],
        local: {
          ...proposal.local,
          confirmations: [...confirmations.values()],
          publication: { status: 'published' }
        }
      }
    })
  }

  const ownerCandidates = (identity: Identity) => {
    const main = store.getState().main
    const { account } = locate(identity)
    return safeOwnerCandidates(
      account,
      identity.chainId,
      Object.values(main.accounts),
      main.signers,
      main.appLock
    )
  }

  const verifiedLocalConfirmationCount = (identity: Identity) => {
    const { deployment, proposal } = locate(identity)
    const owners = new Set(deployment.configuration.owners.map((owner) => owner.toLowerCase()))
    return (
      proposal.local?.confirmations.filter(
        ({ owner, signature }) =>
          owners.has(owner.toLowerCase()) && verifySafeConfirmation(identity.safeTxHash, owner, signature)
      ).length ?? 0
    )
  }

  const setStatus = (identity: Identity, next: StatusEntry) => status.set(keyOf(identity), next)

  const prepareDraft = (input: DetachedSafeTransactionInput): DetachedSafeTransaction => {
    if (disposed) {
      throw new Error('Safe transaction capability is unavailable.')
    }
    const accountId = input.accountId.toLowerCase()
    const account = accountState(accountId)
    const deployment = account?.safe?.[String(input.chainId)]
    if (!account || !deployment || account.profileId !== store.getState().main.currentProfile) {
      throw new Error('Safe deployment is unavailable in this profile.')
    }
    const configuration = safeConfigurationSchema.parse(deployment.configuration)
    const candidate = safeProposalSchema.parse({
      safeTxHash: `0x${'0'.repeat(64)}`,
      safe: deployment.address,
      nonce: configuration.nonce,
      to: input.to,
      value: input.value ?? '0',
      operation: input.operation ?? 0,
      data: input.data ?? '0x',
      safeTxGas: '0',
      baseGas: '0',
      gasPrice: '0',
      gasToken: ZeroAddress,
      refundReceiver: ZeroAddress,
      confirmations: [],
      ...(input.localDecoded ? { localDecoded: input.localDecoded } : {})
    })
    const computed = verifySafeHash(candidate, input.chainId, deployment.address, configuration.version)
    if (!computed.computedHash || computed.status === 'unavailable') {
      throw new Error(computed.reason)
    }
    const proposal = safeProposalSchema.parse({
      ...candidate,
      safeTxHash: computed.computedHash,
      integrity: { ...computed, status: 'matched' },
      local: {
        createdAt: now(),
        ...(input.origin ? { origin: input.origin } : {}),
        confirmations: [],
        publication: { status: 'local' },
        execution: { status: 'idle' }
      }
    })
    return { accountId, chainId: input.chainId, proposal }
  }

  const attach = (draft: DetachedSafeTransaction, requestId: string) => {
    if (disposed) {
      throw new Error('Safe transaction capability is unavailable.')
    }
    const account = accountState(draft.accountId)
    const deployment = account?.safe?.[String(draft.chainId)]
    if (!account || !deployment || draft.proposal.safe !== deployment.address) {
      throw new Error('Safe deployment changed before authorization.')
    }
    const existing = deployment.pending?.find(
      ({ safeTxHash }) => safeTxHash.toLowerCase() === draft.proposal.safeTxHash.toLowerCase()
    )
    const proposal = safeProposalSchema.parse({
      ...(existing ?? draft.proposal),
      local: {
        ...(existing?.local ?? draft.proposal.local!),
        requestId
      }
    })
    store.getState().patchAccount(draft.accountId, {
      safe: {
        ...account.safe,
        [String(draft.chainId)]: {
          ...deployment,
          pending: [
            ...(deployment.pending ?? []).filter(
              ({ safeTxHash }) => safeTxHash.toLowerCase() !== proposal.safeTxHash.toLowerCase()
            ),
            proposal
          ]
        }
      }
    })
    return proposal.safeTxHash
  }

  const cleanupUnsigned = (liveRequestIds: ReadonlySet<string>) => {
    if (disposed) {
      return
    }
    const main = store.getState().main
    for (const account of Object.values(main.accounts)) {
      if (!account.safe) {
        continue
      }
      for (const [chainId, deployment] of Object.entries(account.safe)) {
        for (const proposal of deployment.pending ?? []) {
          const outerTxHash = proposal.local?.execution.transactionHash
          const key = `${account.id.toLowerCase()}:${Number(chainId)}:${proposal.safeTxHash.toLowerCase()}`
          if (proposal.local?.execution.status === 'submitted' && outerTxHash && !delivered.has(key)) {
            delivered.add(key)
            submitted?.({ safeTxHash: proposal.safeTxHash, outerTxHash })
          }
        }
        const pending = deployment.pending?.filter(
          (proposal) =>
            !proposal.local ||
            proposal.local.confirmations.length > 0 ||
            (proposal.local.requestId !== undefined && liveRequestIds.has(proposal.local.requestId))
        )
        if (pending?.length !== deployment.pending?.length) {
          store.getState().patchAccount(account.id, {
            safe: { ...account.safe, [chainId]: { ...deployment, pending } }
          })
        }
      }
    }
  }

  const removeUnsigned = (identity: Identity) => {
    if (disposed) {
      throw new Error('Safe transaction capability is unavailable.')
    }
    const { account, deployment, proposal } = locate(identity)
    if ((proposal.local?.confirmations.length ?? 0) > 0) {
      return false
    }
    store.getState().patchAccount(identity.accountId.toLowerCase(), {
      safe: {
        ...account.safe,
        [String(identity.chainId)]: {
          ...deployment,
          pending: deployment.pending?.filter(
            ({ safeTxHash }) => safeTxHash.toLowerCase() !== identity.safeTxHash.toLowerCase()
          )
        }
      }
    })
    return true
  }

  const approve = (command: SafeApprovalCommand, context: SigningUiContext) => {
    if (disposed || context.owner.clientType !== 'wallet-ui' || !context.isOwnerActive()) {
      return false
    }
    const identity = normalizeIdentity(command)
    const workKey = `${keyOf(identity)}:${command.ownerId.toLowerCase()}`
    if (approvalWork.has(workKey)) {
      return true
    }
    const reference = { id: command.operationId, type: 'account.safe-confirm', owner: context.owner }
    if (operations.lookup(reference)) {
      return true
    }
    if (store.getState().main.appLock.locked || store.getState().main.currentAccount !== identity.accountId) {
      return false
    }
    try {
      operations.start({ ...reference, phase: 'signing' })
    } catch {
      return false
    }
    const controller = new AbortController()
    const unsubscribe = context.subscribeOwnerDisposed(() => controller.abort())
    setStatus(identity, { status: 'signing', operationId: command.operationId, owner: context.owner })
    const work = (async () => {
      try {
        let configuration = await freshConfiguration(identity, controller.signal)
        let proposal = assertProposal(identity, configuration)
        const candidates = ownerCandidates(identity)
        const selected = candidates.find(
          ({ accountId, status }) =>
            accountId.toLowerCase() === command.ownerId.toLowerCase() && status === 'ready'
        )
        if (!selected) {
          throw new Error('Selected owner signer is unavailable.')
        }
        const publication = proposal.local ? proposal.local.publication.status : 'published'
        if (publication === 'published') {
          setStatus(identity, {
            status: 'reconciling',
            operationId: command.operationId,
            owner: context.owner
          })
          operations.advance(reference, { phase: 'reconciling' })
          try {
            await mergeVerifiedServiceState(identity, configuration, controller.signal)
            proposal = locate(identity).proposal
          } catch {
            // A service read failure must not prevent a new local signature.
          }
        }
        let signature = proposal.local?.confirmations.find(
          ({ owner }) => owner.toLowerCase() === selected.address.toLowerCase()
        )?.signature
        if (signature && publication === 'published') {
          setStatus(identity, { status: 'published', operationId: command.operationId, owner: context.owner })
          operations.complete(reference, 'published')
          return
        }
        if (!signature) {
          const frameAccount = accounts.getFrameAccount(selected.accountId)
          if (!frameAccount) {
            throw new Error('Owner account is unavailable.')
          }
          signature = await signTypedData(
            frameAccount,
            getSafeTypedMessage(proposal, identity.chainId, proposal.safe, configuration.version),
            context,
            command.operationId,
            identity.chainId,
            controller.signal
          )
          configuration = await freshConfiguration(identity, controller.signal)
          proposal = assertProposal(identity, configuration)
          if (!configuration.owners.some((owner) => owner.toLowerCase() === selected.address.toLowerCase())) {
            throw new Error('Selected account is no longer an owner of this Safe.')
          }
          if (!verifySafeConfirmation(identity.safeTxHash, selected.address, signature)) {
            throw new Error('Owner wallet returned an invalid Safe confirmation.')
          }
          const verifiedSignature = signature
          replaceProposal(identity, (candidate) => {
            const localized = localize(candidate, publication === 'published' ? 'published' : 'local')
            return {
              ...localized,
              confirmations: localized.confirmations.some(
                (owner) => owner.toLowerCase() === selected.address.toLowerCase()
              )
                ? localized.confirmations
                : [...localized.confirmations, selected.address],
              local: {
                ...localized.local,
                confirmations: [
                  ...localized.local.confirmations.filter(
                    ({ owner }) => owner.toLowerCase() !== selected.address.toLowerCase()
                  ),
                  { owner: selected.address, signature: verifiedSignature }
                ]
              }
            }
          })
        }
        proposal = locate(identity).proposal
        const localCapacity = candidates.filter(({ signerAttached }) => signerAttached).length
        if (localCapacity >= configuration.threshold) {
          setStatus(identity, {
            status:
              (proposal.local?.confirmations.length ?? 0) >= configuration.threshold ? 'ready' : 'local',
            operationId: command.operationId,
            owner: context.owner
          })
          operations.complete(
            reference,
            (proposal.local?.confirmations.length ?? 0) >= configuration.threshold ? 'ready' : 'local'
          )
          return
        }
        setStatus(identity, { status: 'publishing', operationId: command.operationId, owner: context.owner })
        operations.advance(reference, { phase: 'publishing' })
        replaceProposal(identity, (candidate) => ({
          ...candidate,
          local: {
            ...candidate.local!,
            publication: { status: 'publishing' }
          }
        }))
        try {
          if (publication === 'published') {
            await client.confirm(identity.chainId, identity.safeTxHash, signature, controller.signal)
          } else {
            await client.propose(
              identity.chainId,
              proposal,
              { owner: selected.address, signature },
              proposal.local?.origin,
              controller.signal
            )
          }
        } catch {
          // POST outcome can be ambiguous; only a verified read decides whether it committed.
        }
        try {
          const latest = await freshConfiguration(identity, controller.signal)
          await mergeVerifiedServiceState(identity, latest, controller.signal)
          setStatus(identity, { status: 'published', operationId: command.operationId, owner: context.owner })
          operations.complete(reference, 'published')
        } catch (error) {
          replaceProposal(identity, (candidate) => ({
            ...candidate,
            local: {
              ...candidate.local!,
              publication: {
                status: 'failed',
                error: errorMessage(error, 'Safe proposal publication could not be verified.')
              }
            }
          }))
          setStatus(identity, {
            status: 'publication_failed',
            operationId: command.operationId,
            message: 'The local confirmation was saved. Retry will not ask this owner to sign again.',
            owner: context.owner
          })
          operations.fail(
            reference,
            {
              code: 'publication_failed',
              message: 'The local confirmation was saved. Retry will not ask this owner to sign again.'
            },
            'publication_failed'
          )
        }
      } catch (error) {
        const cancelled = controller.signal.aborted
        setStatus(identity, {
          status: cancelled ? 'cancelled' : 'validation_failed',
          operationId: command.operationId,
          message: cancelled
            ? 'Confirmation cancelled. The Safe proposal remains available.'
            : errorMessage(error, 'Safe owner confirmation failed.'),
          owner: context.owner
        })
        operations.fail(
          reference,
          {
            code: cancelled ? 'cancelled' : 'validation_failed',
            message: cancelled
              ? 'Confirmation cancelled. The Safe proposal remains available.'
              : errorMessage(error, 'Safe owner confirmation failed.')
          },
          cancelled ? 'cancelled' : 'validation_failed'
        )
      } finally {
        unsubscribe()
        approvalWork.delete(workKey)
      }
    })()
    approvalWork.set(workKey, work)
    return true
  }

  const prepareExecution = async (identityInput: Identity, executorId: string) => {
    if (disposed) {
      throw new Error('Safe transaction capability is unavailable.')
    }
    const identity = normalizeIdentity(identityInput)
    const configuration = await freshConfiguration(identity)
    let proposal = assertProposal(identity, configuration)
    if (
      (proposal.local?.confirmations.length ?? 0) < configuration.threshold &&
      proposal.local?.publication.status !== 'local'
    ) {
      await mergeVerifiedServiceState(identity, configuration)
      proposal = assertProposal(identity, configuration)
    }
    if (proposal.nonce !== configuration.nonce) {
      throw new Error('Only the current Safe nonce can be executed.')
    }
    const executors = safeExecutorCandidates(
      locate(identity).account,
      Object.values(store.getState().main.accounts),
      store.getState().main.signers,
      store.getState().main.appLock
    )
    if (
      !executors.some(({ accountId, status }) => accountId === executorId.toLowerCase() && status === 'ready')
    ) {
      throw new Error('Selected executor is unavailable.')
    }
    const signatures = proposal.local?.confirmations ?? []
    if (signatures.length < configuration.threshold) {
      throw new Error('Safe owner threshold has not been reached with executable EOA signatures.')
    }
    const packed = packSafeSignatures(identity.safeTxHash, configuration.owners, signatures)
    const calldata = safeAbi.encodeFunctionData('execTransaction', [
      proposal.to,
      proposal.value,
      proposal.data,
      proposal.operation,
      proposal.safeTxGas,
      proposal.baseGas,
      proposal.gasPrice,
      proposal.gasToken,
      proposal.refundReceiver,
      packed
    ])
    replaceProposal(identity, (candidate) => ({
      ...localize(candidate),
      local: { ...localize(candidate).local, execution: { status: 'preparing', executorId } }
    }))
    try {
      const prepared = await provider.prepare(executorId, {
        chainId: `0x${identity.chainId.toString(16)}`,
        to: proposal.safe,
        value: '0x0',
        data: calldata
      })
      replaceProposal(identity, (candidate) => ({
        ...localize(candidate),
        local: {
          ...localize(candidate).local,
          execution: {
            status: 'ready',
            executorId,
            transaction: prepared.transaction,
            ...(prepared.warnings.length ? { warnings: prepared.warnings } : {})
          }
        }
      }))
      setStatus(identity, { status: 'ready' })
      return prepared
    } catch (error) {
      replaceProposal(identity, (candidate) => ({
        ...localize(candidate),
        local: {
          ...localize(candidate).local,
          execution: { status: 'failed', executorId, error: errorMessage(error, 'Preparation failed.') }
        }
      }))
      throw error
    }
  }

  const execute = async (
    identityInput: Identity,
    executorId: string,
    adjustments: TransactionApprovalAdjustments | undefined,
    context: SigningUiContext,
    operationId: string
  ) => {
    if (disposed) {
      throw new Error('Safe transaction capability is unavailable.')
    }
    const identity = normalizeIdentity(identityInput)
    const key = keyOf(identity)
    const existing = executionWork.get(key)
    if (existing) {
      return existing
    }
    const previous = locate(identity).proposal.local?.execution
    if (previous?.status === 'submitted' && previous.transactionHash) {
      return previous.transactionHash
    }
    if (
      previous?.status !== 'ready' ||
      previous.executorId?.toLowerCase() !== executorId.toLowerCase() ||
      !previous.transaction
    ) {
      throw new Error('Prepare and review this executor transaction before approving it.')
    }
    const reviewed = previous.transaction
    const reference = { id: operationId, type: 'account.safe-execute', owner: context.owner }
    if (operations.lookup(reference)) {
      const submitted = locate(identity).proposal.local?.execution.transactionHash
      if (submitted) {
        return submitted
      }
      throw new Error('Safe execution is already in progress.')
    }
    operations.start({ ...reference, phase: 'executing' })
    const work = (async () => {
      try {
        const configuration = await freshConfiguration(identity)
        const proposal = assertProposal(identity, configuration)
        const signatures = proposal.local?.confirmations ?? []
        if (proposal.nonce !== configuration.nonce || signatures.length < configuration.threshold) {
          throw new Error('Safe proposal is no longer executable.')
        }
        const packed = packSafeSignatures(identity.safeTxHash, configuration.owners, signatures)
        const expectedData = safeAbi.encodeFunctionData('execTransaction', [
          proposal.to,
          proposal.value,
          proposal.data,
          proposal.operation,
          proposal.safeTxGas,
          proposal.baseGas,
          proposal.gasPrice,
          proposal.gasToken,
          proposal.refundReceiver,
          packed
        ])
        if (
          reviewed.to.toLowerCase() !== proposal.safe.toLowerCase() ||
          reviewed.data.toLowerCase() !== expectedData.toLowerCase() ||
          reviewed.from.toLowerCase() !== executorId.toLowerCase()
        ) {
          throw new Error('Reviewed executor transaction no longer matches this Safe proposal.')
        }
        replaceProposal(identity, (candidate) => ({
          ...localize(candidate),
          local: {
            ...localize(candidate).local,
            execution: { ...localize(candidate).local.execution, status: 'executing', error: undefined }
          }
        }))
        setStatus(identity, { status: 'executing', operationId, owner: context.owner })
        const outerTxHash = await provider.execute(
          executorId,
          {
            ...reviewed,
            gasFeesSource: reviewed.gasFeesSource === 'Dapp' ? GasFeesSource.Dapp : GasFeesSource.Frame
          },
          adjustments,
          context,
          operationId
        )
        replaceProposal(identity, (candidate) => ({
          ...localize(candidate),
          local: {
            ...localize(candidate).local,
            execution: {
              ...localize(candidate).local.execution,
              status: 'submitted',
              transactionHash: outerTxHash,
              error: undefined
            }
          }
        }))
        setStatus(identity, { status: 'submitted', operationId, owner: context.owner })
        operations.complete(reference, 'submitted')
        if (!isDisposed() && !delivered.has(key)) {
          delivered.add(key)
          submitted?.({ safeTxHash: identity.safeTxHash, outerTxHash })
        }
        return outerTxHash
      } catch (error) {
        replaceProposal(identity, (candidate) => ({
          ...localize(candidate),
          local: {
            ...localize(candidate).local,
            execution: {
              ...localize(candidate).local.execution,
              status: 'failed',
              error: errorMessage(error, 'Safe execution failed.')
            }
          }
        }))
        setStatus(identity, {
          status: 'failed',
          operationId,
          message: errorMessage(error, 'Safe execution failed.'),
          owner: context.owner
        })
        operations.fail(
          reference,
          { code: 'safe_execution_failed', message: errorMessage(error, 'Safe execution failed.') },
          'failed'
        )
        throw error
      } finally {
        executionWork.delete(key)
      }
    })()
    executionWork.set(key, work)
    return work
  }

  return {
    prepareDraft,
    attach,
    approve,
    cleanupUnsigned,
    removeUnsigned,
    prepareExecution,
    execute,
    status(query: SafeConfirmationStatusQuery, owner?: OperationOwner): SafeConfirmationStatus {
      if (disposed) {
        throw new Error('Safe transaction capability is unavailable.')
      }
      const entry = status.get(keyOf(query))
      if (!entry || (owner && entry.owner && entry.owner.windowInstanceId !== owner.windowInstanceId)) {
        const proposal = (() => {
          try {
            return locate(query).proposal
          } catch {
            return undefined
          }
        })()
        const execution = proposal?.local?.execution
        if (execution?.status === 'submitted') {
          return { status: 'submitted' }
        }
        if (execution?.status === 'ready') {
          return { status: 'ready' }
        }
        if (
          proposal &&
          verifiedLocalConfirmationCount(query) >= locate(query).deployment.configuration.threshold
        ) {
          return { status: 'ready' }
        }
        return { status: 'idle' }
      }
      return {
        status: entry.status,
        ...(entry.operationId ? { operationId: entry.operationId } : {}),
        ...(entry.message ? { message: entry.message } : {})
      }
    },
    dispose() {
      disposed = true
      status.clear()
      approvalWork.clear()
      executionWork.clear()
    }
  }
}

export type SafeTransactionService = ReturnType<typeof createSafeTransactionService>
