import type { VisualStage } from '../types.ts'
import { requireAccounts } from './helpers.ts'

export const vitalikPositionsStage: VisualStage = {
  name: 'vitalik positions',
  async run(context) {
    const { driver, runtime, tray } = context
    const { vitalik } = await requireAccounts(context)
    await driver.selectAccount(vitalik, 'vitalik.eth', '03-accounts-panel-vitalik-search.png')
    await tray.getByRole('tab', { name: 'Positions' }).click()
    await runtime.screenshot(tray, '04-vitalik-positions.png')
  }
}
