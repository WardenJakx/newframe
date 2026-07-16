import { v5 as uuidv5 } from 'uuid'

import accounts from '../accounts'
import { flashService } from '../flash/instance'
import provider from '../provider'
import store from '../store'
import type {
  FlashQuoteRequest,
  FlashSubmitOrder,
  TransactionSubmitCommand,
  TypedDataSignCommand
} from '../../resources/bridge/operations'

const internalOriginName = 'newframe-internal'
const internalOriginId = uuidv5(internalOriginName, uuidv5.DNS)

const chainIdHex = (chainId: number) => `0x${chainId.toString(16)}`

function currentAccountAddress() {
  return accounts.current()?.getSelectedAddress() || ''
}

function errorMessage(error: unknown) {
  if (typeof error === 'string') return error.slice(0, 1_000)
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message).slice(0, 1_000)
  }

  return 'The operation failed.'
}

function sendProviderRequest(payload: RPCRequestPayload) {
  return new Promise<RPCResponsePayload>((resolve) => provider.send(payload, resolve))
}

function initializeInternalDappOrigin(chainId: number) {
  const currentStore = store.getState()
  const chain = currentStore.main.networks.ethereum[chainId]
  if (!chain?.on) return false

  currentStore.initOrigin(internalOriginId, {
    name: internalOriginName,
    chain: { id: chainId, type: 'ethereum' }
  })
  return true
}

export async function submitCurrentAccountTransaction(
  command: Pick<TransactionSubmitCommand, 'chainId' | 'idempotencyKey' | 'transaction'>
) {
  const from = currentAccountAddress()
  if (!from) return { ok: false, error: 'no_current_account' } as const
  if (!initializeInternalDappOrigin(command.chainId)) {
    return { ok: false, error: 'provider_error', message: 'Chain is unavailable.' } as const
  }

  const chainId = chainIdHex(command.chainId)
  const response = await sendProviderRequest({
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
  })

  if (response.error) {
    return { ok: false, error: 'provider_error', message: errorMessage(response.error) } as const
  }
  if (typeof response.result !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(response.result)) {
    return { ok: false, error: 'provider_error', message: 'Transaction hash was not returned.' } as const
  }

  return { ok: true, transactionHash: response.result } as const
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

export async function signCurrentAccountTypedData(
  command: Pick<TypedDataSignCommand, 'chainId' | 'typedData'>
) {
  const from = currentAccountAddress()
  if (!from) return { ok: false, error: 'no_current_account' } as const

  const domainChainId = typedDataChainId(command.typedData)
  if (domainChainId !== undefined && domainChainId !== command.chainId) {
    return { ok: false, error: 'chain_mismatch' } as const
  }
  if (!initializeInternalDappOrigin(command.chainId)) {
    return { ok: false, error: 'provider_error', message: 'Chain is unavailable.' } as const
  }

  const response = await sendProviderRequest({
    id: Date.now(),
    jsonrpc: '2.0',
    method: 'eth_signTypedData_v4',
    chainId: chainIdHex(command.chainId),
    params: [from, command.typedData],
    _origin: internalOriginId
  })

  if (response.error) {
    return { ok: false, error: 'provider_error', message: errorMessage(response.error) } as const
  }
  if (typeof response.result !== 'string' || !/^0x[0-9a-fA-F]+$/.test(response.result)) {
    return { ok: false, error: 'provider_error', message: 'Signature was not returned.' } as const
  }

  return { ok: true, signature: response.result } as const
}

export async function quoteFlashForCurrentAccount(request: FlashQuoteRequest) {
  const accountAddress = currentAccountAddress()
  if (!accountAddress) return { ok: false, error: 'no_current_account' } as const
  if (!store.getState().main.networks.ethereum[request.chainId]?.on) {
    return { ok: false, error: 'quote_failed', message: 'Chain is unavailable.' } as const
  }

  try {
    const result = await flashService.quote({
      ...request,
      accountAddress,
      contraChain: request.chainId,
      targetChain: request.chainId
    })

    return { ok: true, quote: result.quote, flash: result.flash } as const
  } catch (error) {
    return { ok: false, error: 'quote_failed', message: errorMessage(error) } as const
  }
}

export async function submitFlashForCurrentAccount(order: FlashSubmitOrder) {
  const accountAddress = currentAccountAddress()
  if (!accountAddress) return { ok: false, error: 'no_current_account' } as const
  if (!store.getState().main.networks.ethereum[order.chainId]?.on) {
    return { ok: false, error: 'submit_failed', message: 'Chain is unavailable.' } as const
  }

  try {
    const result = await flashService.submitOrder({
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
