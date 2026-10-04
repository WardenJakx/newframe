import type { TokenAddCommand, WalletToken } from '../../../../app/contracts/operations.ts'
import { toTokenId } from '../../../../features/tokens/domain/index.ts'
import type { Token, TokenSource } from '../../../../features/tokens/domain/state/token.ts'
import type { OperationService } from '../../../../platform/operations/service.ts'
import type { OperationOwner, OperationReference } from '../../../../platform/operations/types.ts'
import type { CanonicalStore } from '../../../state/store/actions.ts'

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
    lookup: (address: string, chainId: number) => ports.lookup(address, chainId),

    register(tokens: Token[], options: { account?: string; source: TokenSource }) {
      const state = ports.store.getState()
      const byId = state.main.tokens.byId as Record<string, Token | undefined>
      const unknown = tokens.filter((token) => !byId[toTokenId(token)])
      if (options.account) {
        state.upsertTokens(
          tokens.map((token) => byId[toTokenId(token)] ?? token),
          options
        )
      } else if (unknown.length) {
        state.upsertTokens(unknown, options)
      }

      // Scanned balances already carry metadata from their token definitions.
      // Transaction effects may only know a symbol, so refresh those onchain.
      if (options.source === 'transaction') {
        unknown.forEach((token) => {
          void ports
            .lookup(token.address, token.chainId)
            .then((metadata) => {
              if (!metadata?.name || !metadata.symbol || !Number.isInteger(metadata.decimals)) {
                return
              }
              const current = (ports.store.getState().main.tokens.byId as Record<string, Token | undefined>)[
                toTokenId(token)
              ]
              if (!current || current.custom) {
                return
              }
              ports.store
                .getState()
                .upsertTokens(
                  [{ ...current, name: metadata.name, symbol: metadata.symbol, decimals: metadata.decimals }],
                  options
                )
            })
            .catch(() => undefined)
        })
      }
    },

    add(command: TokenAddCommand, owner: OperationOwner) {
      const reference: OperationReference = { owner, id: command.operationId, type: command.type }
      const key = requestKey(reference)
      const fingerprint = requestFingerprint(command)
      if (ports.operations.lookup(reference)) {
        return requestFingerprints.get(key)?.fingerprint === fingerprint
      }

      for (const [storedKey, storedRequest] of requestFingerprints) {
        if (!ports.operations.lookup(storedRequest.reference)) {
          requestFingerprints.delete(storedKey)
        }
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
      const tokensById = state.main.tokens.byId as Record<
        string,
        (typeof state.main.tokens.byId)[string] | undefined
      >
      const canonicalToken = tokensById[toTokenId(token)]
      if (!canonicalToken) {
        return false
      }

      state.removeCustomTokens([canonicalToken])
      return true
    }
  }
}

export type TokenService = ReturnType<typeof createTokenService>
