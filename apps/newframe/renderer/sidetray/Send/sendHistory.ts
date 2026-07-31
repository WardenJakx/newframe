import type { SideTrayRendererState } from '../../../contracts/state/projections'

type SendActivity = SideTrayRendererState['activity'][string]

function normalizeAddress(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function erc20TransferRecipient(calldata?: string) {
  const match = calldata
    ?.trim()
    .toLowerCase()
    .match(/^0xa9059cbb([0-9a-f]{64})[0-9a-f]{64}/)
  return match ? `0x${match[1].slice(-40)}` : ''
}

function tokenTransferRecipients(activity: SendActivity) {
  const recognizedRecipients = (activity.recognizedActions || []).flatMap((action) => {
    const recipient = normalizeAddress(action.data?.recipient?.address)
    return action.id === 'erc20:transfer' && recipient ? [recipient] : []
  })
  const decodedRecipient = erc20TransferRecipient(activity.data?.data)

  return decodedRecipient ? [...recognizedRecipients, decodedRecipient] : recognizedRecipients
}

export function hasSentToAddress({
  activity,
  recipientAddress,
  senderAddress
}: {
  activity: SideTrayRendererState['activity']
  recipientAddress?: string
  senderAddress?: string
}) {
  const recipient = normalizeAddress(recipientAddress)
  const sender = normalizeAddress(senderAddress)
  if (!recipient || !sender) return false

  return Object.values(activity).some((record) => {
    if (record.status === 'reverted') return false

    const recordSender = normalizeAddress(record.account || record.address)
    if (recordSender !== sender) return false

    const tokenRecipients = tokenTransferRecipients(record)
    if (tokenRecipients.length) return tokenRecipients.includes(recipient)

    return normalizeAddress(record.data?.to) === recipient
  })
}
