import type { TokenAddCommand, WalletToken } from '../../../app/contracts/operations.js'
import { toTokenId } from '../domain/index.js'
import type { CanonicalStore } from '../../../platform/state-store/actions.js'
import type { OperationService } from '../../../platform/operations/service.js'
import type { OperationOwner, OperationReference } from '../../../platform/operations/types.js'

type TokenState = Pick<CanonicalStore, 'main' | 'removeCustomTokens' | 'upsertTokens'>

export interface TokenServicePorts {
  lookup(
    address: string,
    chainId: number
  ): Promise<{ decimals: number; name: string; symbol: string; totalSupply: string } | undefined>
  operations: OperationService
  store: { getState(): TokenState }
}

export function createTokenService(ports: TokenServicePorts) {
  const requestFingerprints = new Map<string, { fingerprint: string; reference: OperationReference }>()
  const requestKey = (reference: OperationReference) =>
    JSON.stringify([reference.owner.clientType, reference.owner.windowInstanceId, reference.id])
  const requestFingerprint = (command: TokenAddCommand) =>
    JSON.stringify([
      command.token.chainId,
      command.token.address.toLowerCase(),
      command.token.name,
      command.token.symbol,
      command.token.decimals,
      command.token.logoURI || ''
    ])

  return {
    lookup: ports.lookup,

    add(command: TokenAddCommand, owner: OperationOwner) {
      const reference: OperationReference = { owner, id: command.operationId, type: command.type }
      const key = requestKey(reference)
      const fingerprint = requestFingerprint(command)
      if (ports.operations.lookup(reference)) {
        return requestFingerprints.get(key)?.fingerprint === fingerprint
      }

      for (const [storedKey, storedRequest] of requestFingerprints) {
        if (!ports.operations.lookup(storedRequest.reference)) requestFingerprints.delete(storedKey)
      }

      try {
        ports.operations.start({
          id: reference.id,
          type: reference.type,
          owner,
          phase: 'applying',
          entityRefs: [{ type: 'token', id: toTokenId(command.token) }]
        })
      } catch {
        return false
      }
      requestFingerprints.set(key, { fingerprint, reference })

      try {
        ports.store.getState().upsertTokens([command.token], { custom: true, source: 'custom' })
        ports.operations.complete(reference, 'completed')
      } catch {
        ports.operations.fail(reference, {
          code: 'token_update_failed',
          message: 'Could not update the custom token.'
        })
      }
      return true
    },

    remove(token: Pick<WalletToken, 'address' | 'chainId'>) {
      const state = ports.store.getState()
      const canonicalToken = state.main.tokens.byId[toTokenId(token)]
      if (!canonicalToken) return false

      state.removeCustomTokens([canonicalToken])
      return true
    }
  }
}

export type TokenService = ReturnType<typeof createTokenService>
