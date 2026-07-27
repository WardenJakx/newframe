import {
  createSideTrayTransactionService,
  type SideTrayTransactionPorts
} from '../features/transactions/sideTrayService.js'

export function createSideTrayTransactionOperations(
  provider: SideTrayTransactionPorts['provider'],
  accounts: SideTrayTransactionPorts['accounts'],
  flashService: SideTrayTransactionPorts['flash'],
  canonicalStore: SideTrayTransactionPorts['store'],
  now: SideTrayTransactionPorts['now']
) {
  return createSideTrayTransactionService({
    accounts,
    provider,
    flash: flashService,
    store: canonicalStore,
    now
  })
}
