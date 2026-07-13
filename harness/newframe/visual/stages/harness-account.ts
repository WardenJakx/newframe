import type { VisualStage } from '../types.ts'
import { requireAccounts } from './helpers.ts'

export const harnessAccountStage: VisualStage = {
  name: 'select harness account',
  async run(context) {
    const { driver, runtime, tray } = context
    const { harness } = await requireAccounts(context)
    await driver.selectAccount(harness, harness.address)
    await tray.getByRole('tab', { name: 'Positions' }).click()
    await runtime.screenshot(tray, '05-harness-account-positions.png')
  }
}
