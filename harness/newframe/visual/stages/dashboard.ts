import { sleep } from '../../core/utils.ts'
import type { VisualStage } from '../types.ts'

export const dashboardStage: VisualStage = {
  name: 'dashboard visuals',
  async run({ driver }) {
    const dash = await driver.waitForElectronPage('bundle/dash.html')
    await driver.assertColorTokens(dash, 'Dashboard')
    await driver.screenshot(dash, '00a-dashboard-home.png')

    await driver.trayAction('navDash', { view: 'tokens', data: {} })
    await sleep(800)
    await driver.screenshot(dash, '00b-dashboard-tokens.png')

    await driver.trayAction('navDash', { view: 'dapps', data: {} })
    await sleep(800)
    await driver.screenshot(dash, '00c-dashboard-dapps.png')

    const signerId = Object.keys((await driver.getAppState()).main?.signers || {})[0]
    if (signerId) {
      await driver.trayAction('navDash', { view: 'expandedSigner', data: { signer: signerId } })
      await sleep(800)
      await driver.screenshot(dash, '00d-dashboard-signer.png')
    }

    await driver.trayAction('backDash', 10)
  }
}
