import { getAddress } from 'ethers'
import type {
  AccountSafeImportCommand,
  AccountSafeRefreshCommand,
  SafeSimulateQuery
} from '../../../app/contracts/operations.js'
import type { CanonicalStoreReader } from '../../../platform/state-store/actions.js'
import type { OperationService } from '../../../platform/operations/service.js'
import type { OperationOwner } from '../../../platform/operations/types.js'
import {
  SafeProposalSimulationSchema,
  type SafeConfiguration,
  type SafeDeployment,
  type SafeProposal,
  type SafeProposalSimulation
} from '../domain/safe.js'
import type { SafeSimulationInput } from './safeSimulation.js'

export interface SafeServicePorts {
  accounts: { add(address: string, name: string, options: { type: string }): void }
  store: CanonicalStoreReader
  operations: OperationService
  client: {
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
  }
  simulate?(input: SafeSimulationInput, signal: AbortSignal): Promise<SafeProposalSimulation>
  now?: () => number
}

export type SafeService = ReturnType<typeof createSafeService>

export function createSafeService({
  accounts,
  store,
  operations,
  client,
  simulate: simulateProposal,
  now = Date.now
}: SafeServicePorts) {
  let disposed = false
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
    const account = main.accounts[query.accountId]
    const deployment = account?.safe?.[String(query.chainId)]
    const proposal = deployment?.pending?.find((candidate) => candidate.safeTxHash === query.safeTxHash)
    if (!account || account.profileId !== main.currentProfile || !deployment || !proposal) return
    return {
      input: { chainId: query.chainId, address: deployment.address, proposal },
      fingerprint: JSON.stringify([
        main.currentProfile,
        account.profileId,
        account.created,
        account.address,
        deployment.chainId,
        deployment.address,
        deployment.configuration,
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
    if (disposed || !snapshot)
      return Promise.resolve({
        status: 'unavailable',
        error: 'Safe proposal is no longer available in this profile.'
      })
    if (!simulateProposal)
      return Promise.resolve({ status: 'unavailable', error: 'Safe simulation provider is unavailable.' })
    const key = `${query.accountId}:${query.chainId}:${query.safeTxHash}`
    const existing = simulations.get(key)
    if (existing?.fingerprint === snapshot.fingerprint) return existing.promise
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
      !disposed &&
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
        if (!active()) return cancelled()
        return simulateProposal(structuredClone(snapshot.input), controller.signal)
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
      if (simulations.get(key) === item) simulations.delete(key)
    })
    return item.promise
  }
  const invalidate = () => {
    for (const item of work.values()) item.controller.abort()
    work.clear()
    for (const controller of discoveries) controller.abort()
    for (const item of simulations.values()) item.controller.abort()
    simulations.clear()
  }
  const discoveries = new Set<AbortController>()
  const discoverNetworks = async (address: string) => {
    if (disposed) return []
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
      if (disposed || controller.signal.aborted || capturedProfile !== store.getState().main.currentProfile)
        return []
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
    if (disposed || capturedProfile !== store.getState().main.currentProfile)
      return Promise.reject(new Error('Safe observation was cancelled'))
    const account = store.getState().main.accounts[accountId]
    if (account && account.profileId !== capturedProfile)
      return Promise.reject(new Error('Account belongs to another profile'))
    const deployment = account?.safe?.[String(chainId)]
    if (!importing && !deployment) return Promise.reject(new Error('Safe deployment not found'))
    const key = `${accountId}:${chainId}`
    const existing = work.get(key)
    if (existing) return existing.promise
    if (!force && deployment?.refreshedAt !== undefined && now() - deployment.refreshedAt < 30_000)
      return Promise.resolve()
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
      !disposed &&
      !controller.signal.aborted &&
      work.get(key) === item &&
      store.getState().main.currentProfile === capturedProfile
    const assertActive = () => {
      if (!active()) throw new Error('Safe observation was cancelled')
      const latest = store.getState().main.accounts[accountId]
      if (latest && latest.profileId !== capturedProfile)
        throw new Error('Account belongs to another profile')
    }
    const save = (next: SafeDeployment) => {
      assertActive()
      if (!store.getState().main.accounts[accountId])
        accounts.add(accountId, 'Safe Account', { type: 'Address' })
      const latest = store.getState().main.accounts[accountId]
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
        const configuration = await client.configuration(chainId, address, controller.signal)
        assertActive()
        validated = true
        // An initial configuration is useful even when the queue service fails.
        if (importing && !store.getState().main.accounts[accountId]?.safe?.[String(chainId)]) {
          save({ chainId, address, configuration })
        }
        const pending = await client.pending(chainId, address, configuration, controller.signal)
        assertActive()
        save({ chainId, address, configuration, pending, refreshedAt: now() })
      } catch (error) {
        if (active()) {
          const previous = store.getState().main.accounts[accountId]?.safe?.[String(chainId)]
          if (previous) {
            save({
              ...previous,
              error: error instanceof Error ? error.message.slice(0, 500) : 'Safe refresh failed'
            })
            if (importing && validated) return
          }
        }
        throw error
      } finally {
        if (work.get(key) === item) work.delete(key)
      }
    })()
    return item.promise
  }
  const refresh = async (command: AccountSafeRefreshCommand) => {
    const main = store.getState().main
    const accountId = command.accountId.toLowerCase()
    const account = main.accounts[accountId]
    if (disposed || !account?.safe || account.profileId !== main.currentProfile) return false
    const chainIds = command.chainId === undefined ? Object.keys(account.safe).map(Number) : [command.chainId]
    await Promise.allSettled(
      chainIds.map((chainId) => load(accountId, chainId, false, command.force ?? false, main.currentProfile))
    )
    return true
  }
  const refreshSelected = () => {
    if (selected) void refresh({ type: 'account.safe-refresh', accountId: selected })
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
      if (profile !== nextProfile) invalidate()
      for (const [key, item] of simulations) {
        if (simulationSnapshot(item.query)?.fingerprint !== item.fingerprint) {
          item.controller.abort()
          simulations.delete(key)
        }
      }
      for (const [key, item] of work) {
        const account = accounts[item.accountId]
        if (
          item.existed &&
          (!account ||
            account.profileId !== nextProfile ||
            (item.attached && !account.safe?.[String(item.chainId)]))
        ) {
          item.controller.abort()
          work.delete(key)
        }
        if (account) item.existed = true
      }
      profile = nextProfile
      selected = nextSelected
      if (changed) refreshSelected()
    },
    { equalityFn: (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3] }
  )
  refreshSelected()
  return {
    discoverNetworks,
    simulate,
    refresh,
    import(command: AccountSafeImportCommand, owner: OperationOwner) {
      const reference = { id: command.operationId, type: command.type, owner }
      if (operations.lookup(reference)) return true
      if (disposed) return false
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
      disposed = true
      unsubscribe()
      invalidate()
    }
  }
}
