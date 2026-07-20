import type { VisualStage } from '../types.ts'

export const activityStage: VisualStage = {
  name: 'final activity',
  async run({ driver, runtime, tray }) {
    await driver.clearPanelAndOverlays()
    await driver.selectNetwork('Newframe Local Anvil')
    await tray.getByRole('tab', { name: 'Activity' }).click()
    await runtime.screenshot(tray, '20-final-activity.png')

    await tray.getByRole('group', { name: 'Activity list' }).getByRole('button').first().click()
    await tray.getByRole('dialog', { name: 'Transaction activity details' }).waitFor()
    await tray.waitForTimeout(700)
    await runtime.screenshot(tray, '20a-activity-details.png')
  }
}
