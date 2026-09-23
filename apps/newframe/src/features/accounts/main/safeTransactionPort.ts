import type { SafeConfirmationStatusQuery } from '../../../app/contracts/operations.js'
import type { SafeTransactionService } from './safeTransaction.js'

export type SafeTransactionPort = Pick<
  SafeTransactionService,
  'prepareDraft' | 'attach' | 'approve' | 'cleanupUnsigned' | 'prepareExecution' | 'execute' | 'status'
> & {
  removeUnsigned(identity: SafeConfirmationStatusQuery): boolean
}
