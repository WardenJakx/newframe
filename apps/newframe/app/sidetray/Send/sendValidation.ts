import { isAddress } from 'ethers'

import { parseUnits, toBigInt } from '../../../resources/utils/numbers'
import { cleanAddress, shouldResolveName } from './sendTransaction'

interface SendValidationAsset {
  balance?: string
  decimals?: number
}

interface SendValidationAccount {
  address?: string
}

interface SendRecipientState {
  recipient?: { address?: string } | null
  recipientInput?: string
}

export function getAmountBaseUnits(amount: string, asset?: SendValidationAsset | null) {
  return parseUnits(amount, asset?.decimals || 18)
}

export function getRecipientAddress({ recipient, recipientInput = '' }: SendRecipientState) {
  const selectedRecipient = recipient?.address || ''
  const input = recipientInput.trim()

  if (selectedRecipient) return cleanAddress(selectedRecipient)
  if (isAddress(input)) return cleanAddress(input)

  return ''
}

export function canProceed({
  amount,
  asset,
  recipient,
  recipientInput
}: {
  amount: string
  asset?: SendValidationAsset | null
  recipient?: { address?: string } | null
  recipientInput?: string
}) {
  const amountBaseUnits = asset && getAmountBaseUnits(amount, asset)
  const balance = asset ? toBigInt(asset.balance || 0) || 0n : 0n
  const hasRecipient =
    !!getRecipientAddress({ recipient, recipientInput }) || shouldResolveName(recipientInput)

  return !!asset && hasRecipient && !!amountBaseUnits && amountBaseUnits > 0n && amountBaseUnits <= balance
}

export function validateSendRequest({
  account,
  amount,
  asset,
  balance,
  recipientAddress
}: {
  account?: SendValidationAccount | null
  amount?: bigint
  asset?: SendValidationAsset | null
  balance: bigint
  recipientAddress: string
}) {
  if (!account || !asset || !amount || amount <= 0n) {
    return 'Enter an amount to send.'
  }

  if (amount > balance) {
    return 'Amount exceeds available balance.'
  }

  if (!isAddress(recipientAddress)) {
    return 'Enter a valid recipient.'
  }

  return ''
}
