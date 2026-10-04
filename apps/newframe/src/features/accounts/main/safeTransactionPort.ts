import type { SafeConfirmationStatusQuery } from '../../../app/contracts/operations.ts'
import type { SafeTransactionService } from './safeTransaction.ts'

export type SafeTransactionPort = Pick<
  SafeTransactionService,
  'prepareDraft' | 'attach' | 'approve' | 'cleanupUnsigned' | 'prepareExecution' | 'execute' | 'status'
> & {
  removeUnsigned(identity: SafeConfirmationStatusQuery): boolean
}
