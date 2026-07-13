import type { VisualHarnessContext } from '../types.ts'

export async function requireAccounts(context: VisualHarnessContext) {
  context.accounts ||= context.driver.findHarnessAccounts(await context.driver.getAppState())
  return context.accounts
}
