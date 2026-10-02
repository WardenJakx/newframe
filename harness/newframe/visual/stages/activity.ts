import type { VisualStage } from '../types.ts'

export const activityStage: VisualStage = {
  name: 'final activity',
  async run({ driver, runtime, tray }) {
    await driver.clearPanelAndOverlays()
    await driver.selectNetwork('Newframe Local Anvil')
    await tray.getByRole('tab', { name: 'Activity' }).click()
    await runtime.screenshot(tray, '20-final-activity.png')

    // Completed rows expose hash actions; a pending row can confirm before a click.
    const activity = tray.getByRole('group', { name: 'Activity list' })
    const copy = activity.getByRole('button', { name: /^Copy transaction hash / }).first()
    await copy.waitFor()
    const hash = (await copy.getAttribute('aria-label'))?.replace('Copy transaction hash ', '')
    await activity.getByRole('button', { name: `Copy transaction hash ${hash}`, exact: true }).click()
    await activity.getByRole('button', { name: `Transaction hash copied ${hash}`, exact: true }).waitFor()
    await runtime.screenshot(tray, '20a-activity-hash-copied.png')
  }
}
