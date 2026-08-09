import { v5 as uuidv5 } from 'uuid'

import type { TypedDataV4 } from '../../../app/contracts/operations.js'
import type { TokenData } from '../../../platform/chain-rpc/contracts/erc20.js'
import type { TrustedPrincipal } from '../../access-control/main/authority.js'

const internalOriginName = 'newframe-internal'
const internalOriginId = uuidv5(internalOriginName, uuidv5.DNS)

interface SelectedAccount {
  getSelectedAddress(): string
}

export interface SideTrayTransactionPorts {
  accounts: {
    current(): SelectedAccount | null | undefined
  }
  provider: {
    request(
      payload: RPCRequestPayload,
      principal: TrustedPrincipal,
      context?: { tokenData?: TokenData }
    ): Promise<RPCResponsePayload>
  }
  store: {
    getState(): {
      main: { networks: { ethereum: Record<number, { on?: boolean } | undefined> } }
      initOrigin(id: string, origin: { name: string; chain: { id: number; type: 'ethereum' } }): void
    }
  }
  now(): number
}

const chainIdHex = (chainId: number) => `0x${chainId.toString(16)}`

function errorMessage(error: unknown) {
  if (typeof error === 'string') return error.slice(0, 1_000)
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message).slice(0, 1_000)
  }
  return 'The operation failed.'
}

function typedDataChainId(typedData: TypedDataV4) {
  const value = typedData.domain.chainId
  if (value === undefined || value === null || value === '') return undefined

  const parsed =
    typeof value === 'string' && value.toLowerCase().startsWith('0x')
      ? Number.parseInt(value, 16)
      : Number(value)

  return Number.isInteger(parsed) && parsed > 0 ? parsed : NaN
}

export function createSideTrayTransactionService(ports: SideTrayTransactionPorts) {
  const currentAccountAddress = () => ports.accounts.current()?.getSelectedAddress() || ''
  const initializeOrigin = (chainId: number) => {
    const state = ports.store.getState()
    if (!state.main.networks.ethereum[chainId]?.on) return false
    state.initOrigin(internalOriginId, {
      name: internalOriginName,
      chain: { id: chainId, type: 'ethereum' }
    })
    return true
  }

  return {
    async submitCurrentAccountTransaction(
      command: {
        chainId: number
        idempotencyKey: string
        tokenData?: TokenData
        transaction: { to: string; data?: string; value?: string }
      },
      principal: TrustedPrincipal
    ) {
      const from = currentAccountAddress()
      if (!from) return { ok: false, error: 'no_current_account' } as const
      if (!initializeOrigin(command.chainId)) {
        return { ok: false, error: 'provider_error', message: 'Chain is unavailable.' } as const
      }

      const chainId = chainIdHex(command.chainId)
      const payload = {
        id: command.idempotencyKey,
        jsonrpc: '2.0',
        method: 'eth_sendTransaction',
        chainId,
        params: [
          {
            ...command.transaction,
            chainId,
            from,
            value: command.transaction.value || '0x0'
          }
        ],
        _origin: internalOriginId
      } as RPC.SendTransaction.Request
      const response = command.tokenData
        ? await ports.provider.request(payload, principal, { tokenData: command.tokenData })
        : await ports.provider.request(payload, principal)

      if (response.error) {
        return { ok: false, error: 'provider_error', message: errorMessage(response.error) } as const
      }
      if (typeof response.result !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(response.result)) {
        return { ok: false, error: 'provider_error', message: 'Transaction hash was not returned.' } as const
      }
      return { ok: true, transactionHash: response.result } as const
    },

    async signCurrentAccountTypedData(
      command: { chainId: number; typedData: TypedDataV4 },
      principal: TrustedPrincipal
    ) {
      const from = currentAccountAddress()
      if (!from) return { ok: false, error: 'no_current_account' } as const

      const domainChainId = typedDataChainId(command.typedData)
      if (domainChainId !== undefined && domainChainId !== command.chainId) {
        return { ok: false, error: 'chain_mismatch' } as const
      }
      if (!initializeOrigin(command.chainId)) {
        return { ok: false, error: 'provider_error', message: 'Chain is unavailable.' } as const
      }

      const response = await ports.provider.request(
        {
          id: ports.now(),
          jsonrpc: '2.0',
          method: 'eth_signTypedData_v4',
          chainId: chainIdHex(command.chainId),
          params: [from, command.typedData],
          _origin: internalOriginId
        },
        principal
      )
      if (response.error) {
        return { ok: false, error: 'provider_error', message: errorMessage(response.error) } as const
      }
      if (typeof response.result !== 'string' || !/^0x[0-9a-fA-F]+$/.test(response.result)) {
        return { ok: false, error: 'provider_error', message: 'Signature was not returned.' } as const
      }
      return { ok: true, signature: response.result } as const
    },

    async signCurrentAccountMessage(
      command: { chainId: number; message: string },
      principal: TrustedPrincipal
    ) {
      const from = currentAccountAddress()
      if (!from) return { ok: false, error: 'no_current_account' } as const
      if (!initializeOrigin(command.chainId)) {
        return { ok: false, error: 'provider_error', message: 'Chain is unavailable.' } as const
      }

      const response = await ports.provider.request(
        {
          id: ports.now(),
          jsonrpc: '2.0',
          method: 'personal_sign',
          chainId: chainIdHex(command.chainId),
          params: [command.message, from],
          _origin: internalOriginId
        },
        principal
      )
      if (response.error) {
        return { ok: false, error: 'provider_error', message: errorMessage(response.error) } as const
      }
      if (typeof response.result !== 'string' || !/^0x[0-9a-fA-F]+$/.test(response.result)) {
        return { ok: false, error: 'provider_error', message: 'Signature was not returned.' } as const
      }
      return { ok: true, signature: response.result } as const
    }
  }
}

export type SideTrayTransactionService = ReturnType<typeof createSideTrayTransactionService>
