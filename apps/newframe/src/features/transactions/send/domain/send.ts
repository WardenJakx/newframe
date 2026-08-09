import { NATIVE_CURRENCY } from '../../../tokens/domain/constants.js'

export interface SendAssetIdentity {
  address: string
  chainId: number
}

interface NativeSendTransaction {
  to: string
  value: string
}

interface TokenSendTransaction {
  data: string
  to: string
  value: '0x0'
}

export type SendTransaction = NativeSendTransaction | TokenSendTransaction

function amountHex(amount: bigint) {
  return `0x${amount.toString(16)}`
}

export function encodeErc20Transfer(to: string, amount: bigint) {
  const recipient = to.trim().toLowerCase().replace(/^0x/, '').padStart(64, '0')
  const value = amount.toString(16).padStart(64, '0')

  return `0xa9059cbb${recipient}${value}`
}

export function buildSendTransaction({
  amount,
  asset,
  recipientAddress
}: {
  amount: bigint
  asset: SendAssetIdentity
  recipientAddress: string
}): SendTransaction {
  if (asset.address.toLowerCase() === NATIVE_CURRENCY) {
    return { to: recipientAddress, value: amountHex(amount) }
  }

  return {
    to: asset.address,
    value: '0x0',
    data: encodeErc20Transfer(recipientAddress, amount)
  }
}
