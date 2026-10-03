import { randomUUID } from 'node:crypto'

import type {
  RabbyImportCommand,
  RabbyPreviewQuery,
  RabbyPreviewResult
} from '../../../../app/contracts/operations.js'
import type { OperationService } from '../../../../platform/operations/service.js'
import type { OperationOwner } from '../../../../platform/operations/types.js'
import type { HotSignerImport } from '../../../../platform/signing/domain/hotImport.js'
import type Signer from '../../../../platform/signing/signers/Signer/index.js'
import type { CanonicalStoreReader } from '../../../../platform/state-store/actions.js'
import { safeConfigurationSchema, type SafeConfiguration, type SafeDeployment } from '../../domain/safe.js'
import { AccountSchema, type Account } from '../../domain/state/account.js'
import { decodeRabbySnapshot, RabbyImportError, type RabbyAccount } from './format.js'

export interface RabbyImportPorts {
  store: CanonicalStoreReader
  operations: OperationService
  configuration(chainId: number, address: string): Promise<SafeConfiguration>
  importSigners<T>(
    inputs: HotSignerImport[],
    password: string | undefined,
    commit: (signers: Signer[]) => T
  ): T
  flush(): void
  accountsChanged(addresses: string[]): void
}

const failure = (error: unknown) =>
  error instanceof RabbyImportError
    ? { code: error.code, message: error.message }
    : { code: 'import_failed', message: 'Could not import the Rabby wallet. No accounts were added.' }

export function createRabbyImportService(ports: RabbyImportPorts) {
  let pending = Promise.resolve()
  let lockGeneration = 0
  let disposed = false
  const unsubscribe = ports.store.subscribe(
    (state) => state.main.appLock.locked,
    (locked) => {
      if (locked) {
        lockGeneration += 1
      }
    }
  )
  const assertActive = (generation: number) => {
    if (disposed || generation !== lockGeneration || ports.store.getState().main.appLock.locked) {
      throw new RabbyImportError('wallet_locked', 'Rabby import was cancelled because Newframe was locked.')
    }
  }
  const existingAddresses = () =>
    new Set(
      Object.values(ports.store.getState().main.accounts).flatMap((account) => [
        account.id.toLowerCase(),
        account.address.toLowerCase()
      ])
    )
  const preview = async ({ data, password }: RabbyPreviewQuery): Promise<RabbyPreviewResult> => {
    const generation = lockGeneration
    try {
      assertActive(generation)
      const snapshot = await decodeRabbySnapshot(data, password)
      assertActive(generation)
      const existing = existingAddresses()
      const accounts = snapshot.accounts.map(({ address, name, kind, chainIds, warning }) => ({
        address,
        name,
        kind,
        ...(chainIds ? { chainIds } : {}),
        ...(warning ? { warning } : {}),
        duplicate: existing.has(address.toLowerCase())
      }))
      const skipCount = accounts.filter((account) => account.duplicate).length
      return {
        ok: true,
        accounts,
        importCount: accounts.length - skipCount,
        skipCount,
        unsupportedMetadata: snapshot.unsupportedMetadata
      }
    } catch (error) {
      const safe = failure(error)
      return { ok: false, error: 'import_failed', message: safe.message }
    }
  }

  const execute = async (command: RabbyImportCommand, owner: OperationOwner, generation: number) => {
    const reference = { id: command.operationId, type: command.type, owner }
    try {
      assertActive(generation)
      const snapshot = await decodeRabbySnapshot(command.data, command.password)
      assertActive(generation)
      ports.operations.advance(reference, { phase: 'validating_accounts' })
      const existing = existingAddresses()
      const deployments = new Map<string, Record<string, SafeDeployment>>()
      for (const account of snapshot.accounts) {
        if (account.kind !== 'safe' || existing.has(account.address.toLowerCase())) {
          continue
        }
        const safe: Record<string, SafeDeployment> = {}
        for (const chainId of account.chainIds ?? []) {
          if (!Object.hasOwn(ports.store.getState().main.networks.ethereum, chainId)) {
            throw new RabbyImportError(
              'unsupported_network',
              'Add the Safe network in Newframe before importing this wallet.'
            )
          }
          let configuration: SafeConfiguration
          try {
            configuration = safeConfigurationSchema.parse(await ports.configuration(chainId, account.address))
          } catch {
            throw new RabbyImportError(
              'safe_validation_failed',
              'Could not verify an imported Safe on its network. No accounts were added.'
            )
          }
          assertActive(generation)
          safe[String(chainId)] = { chainId, address: account.address, configuration }
        }
        deployments.set(account.address.toLowerCase(), safe)
      }
      // Address ownership may have changed while the Safe networks were checked.
      const latest = existingAddresses()
      assertActive(generation)
      const fresh = snapshot.accounts.filter((account) => !latest.has(account.address.toLowerCase()))
      if (
        fresh.some((account) => account.kind === 'safe' && !deployments.has(account.address.toLowerCase()))
      ) {
        throw new RabbyImportError(
          'accounts_changed',
          'Accounts changed during the import. Scan the export again.'
        )
      }
      const skipped = snapshot.accounts.length - fresh.length
      if (!fresh.length) {
        ports.operations.complete(reference, `imported_0_skipped_${skipped}`)
        return
      }
      const profileId = randomUUID()
      const profileNames = new Set(
        Object.values(ports.store.getState().main.profiles).map((profile) => profile.name.toLowerCase())
      )
      let name = 'Rabby Wallet Import'
      let suffix = 2
      while (profileNames.has(name.toLowerCase())) {
        name = `Rabby Wallet Import (${suffix++})`
      }
      const hot = fresh.flatMap((account): HotSignerImport[] =>
        account.secret ? [{ address: account.address, secret: account.secret }] : []
      )
      ports.operations.advance(reference, { phase: 'importing' })
      assertActive(generation)
      ports.importSigners(hot, command.newframePassword, (signers) => {
        const accounts: Account[] = fresh.map((account: RabbyAccount) => {
          const id = account.address.toLowerCase()
          const signer = signers.find((candidate) =>
            candidate.addresses.some((address) => address.toLowerCase() === id)
          )
          return AccountSchema.parse({
            id,
            address: id,
            name: account.name,
            profileId,
            created: `new:${Date.now()}`,
            lastSignerType: signer?.type ?? 'Address',
            signer: signer?.id ?? '',
            signerStatus: signer?.status ?? '',
            status: 'ok',
            requests: {},
            ...(deployments.has(id) ? { safe: deployments.get(id) } : {}),
            ...(account.source ? { rabbySource: account.source } : {})
          })
        })
        ports.store.getState().importRabbySnapshot(profileId, name, accounts)
        ports.flush()
      })
      ports.operations.advance(reference, {
        entityRefs: [
          { type: 'profile', id: profileId },
          ...fresh
            .slice(0, 15)
            .map((account) => ({ type: 'account' as const, id: account.address.toLowerCase() }))
        ]
      })
      ports.operations.complete(reference, `imported_${fresh.length}_skipped_${skipped}`)
      ports.accountsChanged([fresh[0].address.toLowerCase()])
    } catch (error) {
      ports.operations.fail(reference, failure(error), 'failed')
    }
  }

  return {
    dispose() {
      disposed = true
      unsubscribe()
    },
    preview,
    import(command: RabbyImportCommand, owner: OperationOwner) {
      const reference = { id: command.operationId, type: command.type, owner }
      if (ports.operations.lookup(reference)) {
        return true
      }
      try {
        ports.operations.start({ ...reference, phase: 'decrypting' })
      } catch {
        return false
      }
      const generation = lockGeneration
      pending = pending.then(() => execute(command, owner, generation))
      return true
    }
  }
}

export type RabbyImportService = ReturnType<typeof createRabbyImportService>
