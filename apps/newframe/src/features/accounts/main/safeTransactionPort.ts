import type { SafeConfirmationStatusQuery } from '@newframe/schema/tray-operations'

import type { SafeTransactionService } from './safeTransaction.ts'

export type SafeTransactionPort = Pick<
  SafeTransactionService,
  'prepareDraft' | 'attach' | 'approve' | 'cleanupUnsigned' | 'prepareExecution' | 'execute' | 'status'
> & {
  removeUnsigned(identity: SafeConfirmationStatusQuery): boolean
}
