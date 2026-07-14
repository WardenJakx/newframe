import { NATIVE_CURRENCY } from '../../../resources/constants'

export interface SendTransactionAsset {
  address: string
  chainId: number
}

export interface NativeSendTransaction {
  to: string
  value: string
}

export interface TokenSendTransaction {
  data: string
  to: string
  value: '0x0'
}

export type SendTransaction = NativeSendTransaction | TokenSendTransaction

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

export function buildSendTransaction({
  amount,
  asset,
  recipientAddress
}: {
  amount: bigint
  asset: SendTransactionAsset
  recipientAddress: string
}): SendTransaction {
  if (asset.address === NATIVE_CURRENCY) {
    return {
      to: recipientAddress,
      value: amountHex(amount)
    }
  }

  return {
    to: asset.address,
    value: '0x0',
    data: encodeErc20Transfer(recipientAddress, amount)
  }
}
