import { getAddress } from 'ethers'

import type {
  AccountCreateCommand,
  AccountRefreshCommand,
  SafeApprovalCommand,
  SafeConfirmationStatusQuery,
  SafeSimulateQuery
} from '../../../app/contracts/operations.js'
import type { OperationService } from '../../../platform/operations/service.js'
import type { OperationOwner } from '../../../platform/operations/types.js'
import type { SigningUiContext } from '../../../platform/signing/signers/Signer/index.js'
import type { CanonicalStore, CanonicalStoreReader } from '../../../platform/state-store/actions.js'
import {
  safeConfigurationSchema,
  safeProposalSchema,
  SafeProposalSimulationSchema,
  type SafeConfiguration,
  type SafeDeployment,
  type SafeProposal,
  type SafeProposalSimulation
} from '../domain/safe.js'
import type { SafeSimulationInput, SafeSimulationPorts } from './safeSimulation.js'
import {
  createSafeTransactionService,
  type SafeTransactionClient,
  type SafeTransactionProvider
} from './safeTransaction.js'

export interface SafeServicePorts {
  accounts: { add(address: string, name: string, options: { type: string }): void }
  store: CanonicalStoreReader
  operations: OperationService
  client: {
    queueState(
      chainId: number,
      address: string,
      signal?: AbortSignal
    ): Promise<Pick<SafeConfiguration, 'nonce'> | SafeConfiguration>
    configuration(
      chainId: number,
      address: string,
      signal?: AbortSignal,
      blockTag?: string
    ): Promise<SafeConfiguration>
    pending(
      chainId: number,
      address: string,
      configuration: SafeConfiguration,
      signal?: AbortSignal
    ): Promise<SafeProposal[]>
    discover(
      chainId: number,
      address: string,
      signal?: AbortSignal
    ): Promise<{ version: string; owners: string[] }>
  } & Partial<Omit<SafeTransactionClient, 'configuration'>>
  simulate?: (
    input: SafeSimulationInput,
    signal: AbortSignal,
    observeConfiguration: NonNullable<SafeSimulationPorts['observeConfiguration']>
  ) => Promise<SafeProposalSimulation>
  now?: () => number
  transactions?: {
    accounts: { getFrameAccount(id: string): import('./Account.js').default | null }
    provider: SafeTransactionProvider
    submitted?: (result: { safeTxHash: string; outerTxHash: string }) => void
  }
}

export type SafeService = ReturnType<typeof createSafeService>

export function createSafeService({
  accounts,
  store,
  operations,
  client,
  simulate: simulateProposal,
  transactions,
  now = Date.now
}: SafeServicePorts) {
  const unavailableError = () => new Error('Safe transaction service is unavailable.')
  const propose = client.propose
  const transaction = client.transaction
  const confirmations = client.confirmations
  const confirm = client.confirm
  const transactionService = createSafeTransactionService({
    store,
    operations,
    accounts: transactions?.accounts ?? {
      getFrameAccount: () => null
    },
    client: {
      configuration: (chainId, address, signal, blockTag) =>
        client.configuration(chainId, address, signal, blockTag),
      propose: propose
        ? (chainId, candidate, confirmation, origin, signal) =>
            propose(chainId, candidate, confirmation, origin, signal)
        : () => Promise.reject(unavailableError()),
      transaction: transaction
        ? (chainId, safe, hash, configuration, signal) =>
            transaction(chainId, safe, hash, configuration, signal)
        : () => Promise.reject(unavailableError()),
      confirmations: confirmations
        ? (chainId, hash, signal) => confirmations(chainId, hash, signal)
        : () => Promise.reject(unavailableError()),
      confirm: confirm
        ? (chainId, hash, signature, signal) => confirm(chainId, hash, signature, signal)
        : () => Promise.reject(unavailableError())
    },
    provider: transactions?.provider ?? {
      prepare: () => Promise.reject(unavailableError()),
      execute: () => Promise.reject(unavailableError())
    },
    submitted: transactions?.submitted,
    now
  })
  const lifecycle = { disposed: false }
  const isDisposed = () => lifecycle.disposed
  const accountState = (accountId: string) =>
    (
      store.getState().main.accounts as Record<string, CanonicalStore['main']['accounts'][string] | undefined>
    )[accountId]
  let profile = store.getState().main.currentProfile
  let selected = store.getState().main.currentAccount
  const work = new Map<
    string,
    {
      controller: AbortController
      accountId: string
      chainId: number
      existed: boolean
      attached: boolean
      promise: Promise<void>
    }
  >()
  const simulations = new Map<
    string,
    {
      controller: AbortController
      query: SafeSimulateQuery
      fingerprint: string
      promise: Promise<SafeProposalSimulation>
    }
  >()
  const simulationSnapshot = (query: SafeSimulateQuery) => {
    const main = store.getState().main
    const account = accountState(query.accountId)
    const deployment = account?.safe?.[String(query.chainId)]
    const proposal = deployment?.pending?.find((candidate) => candidate.safeTxHash === query.safeTxHash)
    if (!account || account.profileId !== main.currentProfile || !deployment || !proposal) {
      return
    }
    return {
      input: { chainId: query.chainId, address: deployment.address, proposal },
      // Simulation reads configuration at its own pinned block, independently of this cache.
      fingerprint: JSON.stringify([
        main.currentProfile,
        account.profileId,
        account.created,
        account.address,
        deployment.chainId,
        deployment.address,
        main.networks.ethereum[query.chainId],
        proposal.safeTxHash,
        proposal.safe,
        proposal.to,
        proposal.value,
        proposal.data,
        proposal.operation,
        proposal.nonce,
        proposal.safeTxGas,
        proposal.baseGas,
        proposal.gasPrice,
        proposal.gasToken,
        proposal.refundReceiver
      ])
    }
  }
  const cancelled = (): SafeProposalSimulation => ({
    status: 'unavailable',
    error: 'Safe simulation cancelled because its account or proposal changed.'
  })
  const simulate = (requested: SafeSimulateQuery): Promise<SafeProposalSimulation> => {
    const query = {
      ...requested,
      accountId: requested.accountId.toLowerCase(),
      safeTxHash: requested.safeTxHash.toLowerCase()
    }
    const snapshot = simulationSnapshot(query)
    if (lifecycle.disposed || !snapshot) {
      return Promise.resolve({
        status: 'unavailable',
        error: 'Safe proposal is no longer available in this profile.'
      })
    }
    if (!simulateProposal) {
      return Promise.resolve({ status: 'unavailable', error: 'Safe simulation provider is unavailable.' })
    }
    const key = `${query.accountId}:${query.chainId}:${query.safeTxHash}`
    const existing = simulations.get(key)
    if (existing?.fingerprint === snapshot.fingerprint) {
      return existing.promise
    }
    existing?.controller.abort()
    const controller = new AbortController()
    const item = {
      controller,
      query,
      fingerprint: snapshot.fingerprint,
      promise: Promise.resolve(cancelled())
    }
    simulations.set(key, item)
    const active = () =>
      !lifecycle.disposed &&
      !controller.signal.aborted &&
      simulations.get(key) === item &&
      simulationSnapshot(query)?.fingerprint === item.fingerprint
    let abort!: () => void
    const aborted = new Promise<SafeProposalSimulation>((resolve) => {
      abort = () => resolve(cancelled())
      controller.signal.addEventListener('abort', abort, { once: true })
    })
    const result = Promise.resolve()
      .then(() => {
        if (!active()) {
          return cancelled()
        }
        return simulateProposal(
          structuredClone(snapshot.input),
          controller.signal,
          (configuration, block) => {
            if (!active()) {
              return
            }
            const account = accountState(query.accountId)
            const deployment = account?.safe?.[String(query.chainId)]
            if (!account || !deployment) {
              return
            }
            if (
              deployment.configurationBlockNumber !== undefined &&
              BigInt(block) < BigInt(deployment.configurationBlockNumber)
            ) {
              return
            }
            store.getState().patchAccount(query.accountId, {
              safe: {
                ...account.safe,
                [String(query.chainId)]: {
                  ...deployment,
                  configuration: safeConfigurationSchema.parse(configuration),
                  configurationBlockNumber: block
                }
              }
            })
          }
        )
      })
      .then(
        (value) => (active() ? SafeProposalSimulationSchema.parse(value) : cancelled()),
        (error: unknown): SafeProposalSimulation => ({
          status: 'unavailable',
          error: error instanceof Error ? error.message.slice(0, 1000) : 'Safe simulation unavailable.'
        })
      )
    item.promise = Promise.race([result, aborted]).finally(() => {
      controller.signal.removeEventListener('abort', abort)
      if (simulations.get(key) === item) {
        simulations.delete(key)
      }
    })
    return item.promise
  }
  const invalidate = () => {
    for (const item of work.values()) {
      item.controller.abort()
    }
    work.clear()
    for (const controller of discoveries) {
      controller.abort()
    }
    for (const item of simulations.values()) {
      item.controller.abort()
    }
    simulations.clear()
  }
  const discoveries = new Set<AbortController>()
  const discoverNetworks = async (address: string) => {
    if (lifecycle.disposed) {
      return []
    }
    const controller = new AbortController()
    discoveries.add(controller)
    const capturedProfile = store.getState().main.currentProfile
    try {
      const results = await Promise.allSettled(
        Object.values(store.getState().main.networks.ethereum).map(async (network) => {
          await client.discover(network.id, address, controller.signal)
          return { chainId: network.id, name: network.name, supported: true }
        })
      )
      if (
        isDisposed() ||
        controller.signal.aborted ||
        capturedProfile !== store.getState().main.currentProfile
      ) {
        return []
      }
      return results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []))
    } finally {
      discoveries.delete(controller)
    }
  }

  const load = (
    accountId: string,
    chainId: number,
    importing: boolean,
    force: boolean,
    capturedProfile: string
  ) => {
    if (lifecycle.disposed || capturedProfile !== store.getState().main.currentProfile) {
      return Promise.reject(new Error('Safe observation was cancelled'))
    }
    const account = accountState(accountId)
    if (account && account.profileId !== capturedProfile) {
      return Promise.reject(new Error('Account belongs to another profile'))
    }
    const deployment = account?.safe?.[String(chainId)]
    if (!importing && !deployment) {
      return Promise.reject(new Error('Safe deployment not found'))
    }
    const key = `${accountId}:${chainId}`
    const existing = work.get(key)
    if (existing) {
      return existing.promise
    }
    if (!force && deployment?.refreshedAt !== undefined && now() - deployment.refreshedAt < 30_000) {
      return Promise.resolve()
    }
    const controller = new AbortController()
    const item = {
      controller,
      accountId,
      chainId,
      existed: Boolean(account),
      attached: Boolean(deployment),
      promise: Promise.resolve()
    }
    const active = () =>
      !lifecycle.disposed &&
      !controller.signal.aborted &&
      work.get(key) === item &&
      store.getState().main.currentProfile === capturedProfile
    const assertActive = () => {
      if (!active()) {
        throw new Error('Safe observation was cancelled')
      }
      const latest = accountState(accountId)
      if (latest && latest.profileId !== capturedProfile) {
        throw new Error('Account belongs to another profile')
      }
    }
    const save = (next: SafeDeployment) => {
      assertActive()
      if (!accountState(accountId)) {
        accounts.add(accountId, 'Safe Account', { type: 'Address' })
      }
      const latest = accountState(accountId)
      item.attached = true
      if (latest) {
        store.getState().patchAccount(accountId, { safe: { ...latest.safe, [String(chainId)]: next } })
      } else {
        throw new Error('Could not create Safe account')
      }
      item.existed = true
    }
    work.set(key, item)
    item.promise = (async () => {
      let validated = false
      try {
        const address = getAddress(accountId)
        // Service proposals are untrusted coordination data. Always refresh the full
        // onchain owner set, threshold, version, and nonce before importing them.
        const observed = await client.configuration(chainId, address, controller.signal)
        assertActive()
        const latest = accountState(accountId)?.safe?.[String(chainId)]
        const configuration = safeConfigurationSchema.parse(observed)
        validated = true
        // Retain observed state even if the queue service fails afterward.
        save({ ...latest, chainId, address, configuration })
        const pending = await client.pending(chainId, address, configuration, controller.signal)
        assertActive()
        const current = accountState(accountId)?.safe?.[String(chainId)]
        if (!current) {
          throw new Error('Safe deployment was removed during refresh')
        }
        const local = new Map((current.pending ?? []).map((proposal) => [proposal.safeTxHash, proposal]))
        const merged = pending.map((proposal) => {
          const existing = local.get(proposal.safeTxHash)
          local.delete(proposal.safeTxHash)
          if (!existing?.local) {
            return proposal
          }
          return safeProposalSchema.parse({
            ...proposal,
            confirmations: [
              ...new Set([
                ...proposal.confirmations,
                ...existing.local.confirmations.map(({ owner }) => owner)
              ])
            ],
            local: existing.local
          })
        })
        for (const proposal of local.values()) {
          if (proposal.local && BigInt(proposal.nonce) >= BigInt(current.configuration.nonce)) {
            merged.push(proposal)
          }
        }
        save({
          ...current,
          pending: merged.filter((proposal) => BigInt(proposal.nonce) >= BigInt(current.configuration.nonce)),
          refreshedAt: now(),
          error: undefined
        })
      } catch (error) {
        if (active()) {
          const previous = accountState(accountId)?.safe?.[String(chainId)]
          if (previous) {
            save({
              ...previous,
              error: error instanceof Error ? error.message.slice(0, 500) : 'Safe refresh failed'
            })
            if (importing && validated) {
              return
            }
          }
        }
        throw error
      } finally {
        if (work.get(key) === item) {
          work.delete(key)
        }
      }
    })()
    return item.promise
  }
  const refresh = async (command: AccountRefreshCommand) => {
    const main = store.getState().main
    const accountId = command.accountId.toLowerCase()
    const account = accountState(accountId)
    if (lifecycle.disposed || !account?.safe || account.profileId !== main.currentProfile) {
      return false
    }
    const chainIds = command.chainId === undefined ? Object.keys(account.safe).map(Number) : [command.chainId]
    await Promise.allSettled(
      chainIds.map((chainId) => load(accountId, chainId, false, command.force ?? false, main.currentProfile))
    )
    return true
  }
  const refreshSelected = () => {
    if (selected) {
      void refresh({ type: 'account.refresh', accountId: selected })
    }
  }
  const unsubscribe = store.subscribe(
    (state) =>
      [
        state.main.currentProfile,
        state.main.currentAccount,
        state.main.accounts,
        state.main.networks
      ] as const,
    ([nextProfile, nextSelected, accounts]) => {
      const changed = profile !== nextProfile || selected !== nextSelected
      if (profile !== nextProfile) {
        invalidate()
      }
      for (const [key, item] of simulations) {
        if (simulationSnapshot(item.query)?.fingerprint !== item.fingerprint) {
          item.controller.abort()
          simulations.delete(key)
        }
      }
      for (const [key, item] of work) {
        const account = (accounts as Record<string, (typeof accounts)[string] | undefined>)[item.accountId]
        if (
          item.existed &&
          (!account ||
            account.profileId !== nextProfile ||
            (item.attached && !account.safe?.[String(item.chainId)]))
        ) {
          item.controller.abort()
          work.delete(key)
        }
        if (account) {
          item.existed = true
        }
      }
      profile = nextProfile
      selected = nextSelected
      if (changed) {
        refreshSelected()
      }
    },
    { equalityFn: (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3] }
  )
  refreshSelected()
  return {
    approve: (command: SafeApprovalCommand, context: SigningUiContext) =>
      transactionService.approve(command, context),
    status: (query: SafeConfirmationStatusQuery, owner?: OperationOwner) =>
      transactionService.status(query, owner),
    attach: (draft: Parameters<typeof transactionService.attach>[0], requestId: string) =>
      transactionService.attach(draft, requestId),
    removeUnsigned: (identity: Parameters<typeof transactionService.removeUnsigned>[0]) =>
      transactionService.removeUnsigned(identity),
    cleanupUnsigned: (liveRequestIds: ReadonlySet<string>) =>
      transactionService.cleanupUnsigned(liveRequestIds),
    confirm: (command: SafeApprovalCommand, context: SigningUiContext) =>
      transactionService.approve(command, context),
    confirmationStatus: (query: SafeConfirmationStatusQuery, owner?: OperationOwner) =>
      transactionService.status(query, owner),
    prepareDraft: (input: Parameters<typeof transactionService.prepareDraft>[0]) =>
      transactionService.prepareDraft(input),
    attachDraft: (draft: Parameters<typeof transactionService.attach>[0], requestId: string) =>
      transactionService.attach(draft, requestId),
    removeUnsignedDraft: (identity: Parameters<typeof transactionService.removeUnsigned>[0]) =>
      transactionService.removeUnsigned(identity),
    cleanupUnsignedDrafts: (liveRequestIds: ReadonlySet<string>) =>
      transactionService.cleanupUnsigned(liveRequestIds),
    prepareExecution: (
      identity: Parameters<typeof transactionService.prepareExecution>[0],
      executorId: string
    ) => transactionService.prepareExecution(identity, executorId),
    execute: (...args: Parameters<typeof transactionService.execute>) => transactionService.execute(...args),
    discoverNetworks,
    simulate,
    refresh,
    import(command: Extract<AccountCreateCommand, { source: 'safe' }>, owner: OperationOwner) {
      const reference = { id: command.operationId, type: 'account.safe-import', owner }
      if (operations.lookup(reference)) {
        return true
      }
      if (lifecycle.disposed) {
        return false
      }
      try {
        operations.start({ ...reference, phase: 'loading_safe' })
      } catch {
        return false
      }
      const capturedProfile = store.getState().main.currentProfile
      // Start synchronously so lifecycle ownership is captured before any I/O.
      const pending = load(command.address.toLowerCase(), command.chainId, true, true, capturedProfile)
      void pending.then(
        () => {
          operations.advance(reference, {
            phase: 'imported',
            entityRefs: [{ type: 'account', id: command.address.toLowerCase() }]
          })
          operations.complete(reference, 'imported')
        },
        (error: unknown) => {
          operations.fail(
            reference,
            {
              code: 'safe_import_failed',
              message: error instanceof Error ? error.message.slice(0, 256) : 'Could not import Safe'
            },
            'failed'
          )
        }
      )
      return true
    },
    dispose() {
      transactionService.dispose()
      lifecycle.disposed = true
      unsubscribe()
      invalidate()
    }
  }
}
