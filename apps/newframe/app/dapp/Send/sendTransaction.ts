import { NATIVE_CURRENCY } from '../../../resources/constants'
import { buildInternalDappOrigin, internalDappOriginId } from '../dappOrigin'

export const frameOriginId = internalDappOriginId

export interface SendTransactionAccount {
  address: string
}

export interface SendTransactionAsset {
  address: string
  chainId: number
}

export interface NativeSendTransaction {
  chainId: string
  from: string
  to: string
  value: string
}

export interface TokenSendTransaction {
  chainId: string
  data: string
  from: string
  to: string
  value: '0x0'
}

export type SendTransaction = NativeSendTransaction | TokenSendTransaction

export interface ProviderSendPayload {
  _origin: string
  chainId: string
  id: number
  jsonrpc: '2.0'
  method: 'eth_sendTransaction'
  params: [SendTransaction]
}

export function cleanAddress(address = '') {
  return address.trim().toLowerCase()
}

export function shouldResolveName(input = '') {
  const value = input.trim()

  return !!value && !/\s/.test(value)
}

export function amountHex(amount: bigint) {
  return `0x${amount.toString(16)}`
}

export function encodeErc20Transfer(to: string, amount: bigint) {
  const recipient = cleanAddress(to).replace(/^0x/, '').padStart(64, '0')
  const value = amount.toString(16).padStart(64, '0')

  return `0xa9059cbb${recipient}${value}`
}

export function chainIdHex(chainId: number) {
  return `0x${chainId.toString(16)}`
}

export function buildSendTransaction({
  account,
  amount,
  asset,
  recipientAddress
}: {
  account: SendTransactionAccount
  amount: bigint
  asset: SendTransactionAsset
  recipientAddress: string
}): SendTransaction {
  const chainId = chainIdHex(asset.chainId)

  if (asset.address === NATIVE_CURRENCY) {
    return {
      from: account.address,
      to: recipientAddress,
      value: amountHex(amount),
      chainId
    }
  }

  return {
    from: account.address,
    to: asset.address,
    value: '0x0',
    data: encodeErc20Transfer(recipientAddress, amount),
    chainId
  }
}

export function buildProviderSendPayload({
  chainId,
  id = Date.now(),
  originId = frameOriginId,
  transaction
}: {
  chainId: number
  id?: number
  originId?: string
  transaction: SendTransaction
}): ProviderSendPayload {
  return {
    id,
    jsonrpc: '2.0',
    method: 'eth_sendTransaction',
    chainId: chainIdHex(chainId),
    params: [transaction],
    _origin: originId
  }
}

export function buildSendOrigin(chainId: number) {
  return buildInternalDappOrigin(chainId)
}
