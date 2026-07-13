import type { VisualStage } from '../types.ts'
import { requireAccounts } from './helpers.ts'

export const anvilPositionsStage: VisualStage = {
  name: 'anvil eth positions',
  async run(context) {
    const { driver, runtime, tray } = context
    const { harness } = await requireAccounts(context)
    await driver.clearPanelAndOverlays()
    await driver.setSelectedAccount(harness)
    await driver.selectNetwork('Newframe Local Anvil')
    await tray.getByRole('tab', { name: 'Positions' }).click()
    await driver.waitForState(
      (state) => Boolean(driver.nativeAnvilBalance(state, harness.address)),
      5_000,
      'Anvil ETH did not appear for the seeded harness account'
    )
    const ethAssetDetails = tray.getByRole('button', { name: 'ETH asset details' })
    await ethAssetDetails.waitFor({ state: 'visible', timeout: 5_000 }).catch(async (err) => {
      await runtime.screenshot(tray, '09-anvil-network-positions.png')
      throw err
    })
    await runtime.screenshot(tray, '09-anvil-network-positions.png')
    await ethAssetDetails.click()
    await tray.getByRole('dialog', { name: 'Asset details' }).waitFor({ state: 'visible' })
    await runtime.screenshot(tray, '10-eth-asset-details.png')
  }
}
