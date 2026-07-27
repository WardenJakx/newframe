import { v5 as uuidv5 } from 'uuid'

import type {
  FlashQuoteRequest,
  FlashSubmitOrder,
  TransactionSubmitCommand,
  TypedDataSignCommand
} from '../../../contracts/operations.js'
import type { TrustedPrincipal } from '../../authority.js'

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
    send(payload: RPCRequestPayload, respond: RPCRequestCallback, principal: TrustedPrincipal): unknown
  }
  flash: {
    quote(
      request: FlashQuoteRequest & { accountAddress: string; contraChain: number; targetChain: number }
    ): Promise<{ quote: unknown; flash: unknown }> | { quote: unknown; flash: unknown }
    submitOrder(
      order: FlashSubmitOrder & {
        accountAddress: string
        contraChain: number
        idempotencyKey?: string
        targetChain: number
      }
    ): Promise<{ orderId: string }> | { orderId: string }
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

function typedDataChainId(typedData: TypedDataSignCommand['typedData']) {
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
  const sendProviderRequest = (payload: RPCRequestPayload, principal: TrustedPrincipal) =>
    new Promise<RPCResponsePayload>((resolve) => ports.provider.send(payload, resolve, principal))
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
      command: Pick<TransactionSubmitCommand, 'chainId' | 'idempotencyKey' | 'transaction'>,
      principal: TrustedPrincipal
    ) {
      const from = currentAccountAddress()
      if (!from) return { ok: false, error: 'no_current_account' } as const
      if (!initializeOrigin(command.chainId)) {
        return { ok: false, error: 'provider_error', message: 'Chain is unavailable.' } as const
      }

      const chainId = chainIdHex(command.chainId)
      const response = await sendProviderRequest(
        {
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
        },
        principal
      )

      if (response.error) {
        return { ok: false, error: 'provider_error', message: errorMessage(response.error) } as const
      }
      if (typeof response.result !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(response.result)) {
        return { ok: false, error: 'provider_error', message: 'Transaction hash was not returned.' } as const
      }
      return { ok: true, transactionHash: response.result } as const
    },

    async signCurrentAccountTypedData(
      command: Pick<TypedDataSignCommand, 'chainId' | 'typedData'>,
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

      const response = await sendProviderRequest(
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

    async quoteFlashForCurrentAccount(request: FlashQuoteRequest) {
      const accountAddress = currentAccountAddress()
      if (!accountAddress) return { ok: false, error: 'no_current_account' } as const
      if (!ports.store.getState().main.networks.ethereum[request.chainId]?.on) {
        return { ok: false, error: 'quote_failed', message: 'Chain is unavailable.' } as const
      }

      try {
        const result = await ports.flash.quote({
          ...request,
          accountAddress,
          contraChain: request.chainId,
          targetChain: request.chainId
        })
        return { ok: true, quote: result.quote, flash: result.flash } as const
      } catch (error) {
        return { ok: false, error: 'quote_failed', message: errorMessage(error) } as const
      }
    },

    async submitFlashForCurrentAccount(order: FlashSubmitOrder) {
      const accountAddress = currentAccountAddress()
      if (!accountAddress) return { ok: false, error: 'no_current_account' } as const
      if (!ports.store.getState().main.networks.ethereum[order.chainId]?.on) {
        return { ok: false, error: 'submit_failed', message: 'Chain is unavailable.' } as const
      }

      try {
        const result = await ports.flash.submitOrder({
          ...order,
          accountAddress,
          contraChain: order.chainId,
          idempotencyKey: order.quoteId || order.quote.id,
          targetChain: order.chainId
        })
        return { ok: true, orderId: result.orderId } as const
      } catch (error) {
        return { ok: false, error: 'submit_failed', message: errorMessage(error) } as const
      }
    }
  }
}

export type SideTrayTransactionService = ReturnType<typeof createSideTrayTransactionService>
