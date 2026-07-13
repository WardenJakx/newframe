import { sleep } from '../../core/utils.ts'
import type { VisualStage } from '../types.ts'

export const trayOverlaysStage: VisualStage = {
  name: 'tray overlay visuals',
  async run({ runtime, tray }) {
    const mainMenuButton = tray.getByRole('button', { name: 'Main menu' })
    await mainMenuButton.click()
    const menu = tray.getByRole('dialog', { name: 'Main menu' })
    await menu.waitFor({ state: 'visible' })
    await sleep(500)
    await runtime.screenshot(tray, '02a-main-menu.png')

    for (const [label, filename] of [
      ['Requests', '02b-requests-overlay.png'],
      ['Dapps', '02c-dapps-overlay.png'],
      ['Settings', '02d-settings-overlay.png']
    ] as const) {
      await menu.getByRole('button', { name: label }).click()
      const overlay = tray.getByRole('dialog', { name: label })
      await overlay.waitFor({ state: 'visible' })
      await sleep(500)
      await runtime.screenshot(tray, filename)
      await overlay.getByRole('button', { name: 'Back' }).click()
      await menu.waitFor({ state: 'visible' })
      await sleep(500)
    }

    await menu.getByRole('button', { name: 'Close menu' }).click()
    await menu.waitFor({ state: 'hidden' })

    await tray.getByRole('button', { name: 'Network filter' }).click()
    const networks = tray.getByRole('dialog', { name: 'Networks' })
    await networks.waitFor({ state: 'visible' })
    await sleep(500)
    await runtime.screenshot(tray, '02e-networks-overlay.png')
    await networks.getByRole('button', { name: 'Back' }).click()
    await networks.waitFor({ state: 'hidden' })
  }
}
