import type { TransactionData } from '../../../domain/transaction'
import type { SignerSummary } from '../../signers/Signer'
import type { SignerCompatibility } from '../../transaction'

export interface AccountTransactionPolicyPort {
  maxFee(transaction: TransactionData): number
  signerCompatibility(transaction: TransactionData, signer: SignerSummary): SignerCompatibility
}

export function createDeferredAccountTransactionPolicyPort() {
  let target: AccountTransactionPolicyPort | undefined

  const getTarget = () => {
    if (!target) throw new Error('Account transaction policy capability is not connected')
    return target
  }

  const port: AccountTransactionPolicyPort = {
    maxFee: (transaction) => getTarget().maxFee(transaction),
    signerCompatibility: (transaction, signer) => getTarget().signerCompatibility(transaction, signer)
  }

  return {
    port,
    connect(next: AccountTransactionPolicyPort) {
      const previous = target
      target = next
      let connected = true

      return () => {
        if (!connected) return
        connected = false
        if (target === next) target = previous
      }
    }
  }
}
