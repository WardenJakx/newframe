import link from '../../../resources/link'
import { cleanAddress, type SendTransaction } from './sendTransaction'

export async function resolveName(name: string) {
  const result = await link.executeQuery({ type: 'name.resolve', name })
  if (!result.ok) throw new Error('Could not resolve name')

  return cleanAddress(result.address)
}

export function submitTransaction(chainId: number, transaction: SendTransaction, idempotencyKey: string) {
  return link.executeCommand({ type: 'transaction.submit', idempotencyKey, chainId, transaction })
}

export function closeSend() {
  void link.executeCommand({ type: 'sidetray.close' })
}
