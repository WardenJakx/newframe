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
      ['Custom Tokens', '02d-custom-tokens-overlay.png'],
      ['Settings', '02e-settings-overlay.png']
    ] as const) {
      await menu.getByRole('button', { name: label }).click()
      const overlay = tray.getByRole('dialog', { name: label })
      await overlay.waitFor({ state: 'visible' })
      await sleep(500)
      await runtime.screenshot(tray, filename)

      if (label === 'Settings') {
        const appSettings = overlay.getByRole('group', { name: 'App' })
        const resetSavedData = appSettings.getByRole('button', { name: 'Reset Saved Data' })
        const resetAllSettings = appSettings.getByRole('button', {
          name: 'Reset All Settings & Data'
        })

        await resetSavedData.waitFor({ state: 'visible' })
        await resetAllSettings.waitFor({ state: 'visible' })
        const resetActionOrder = await appSettings
          .getByRole('button')
          .evaluateAll((buttons) =>
            buttons.map((button) => button.getAttribute('aria-label')).filter(Boolean)
          )
        if (
          resetActionOrder.indexOf('Reset Saved Data') > resetActionOrder.indexOf('Reset All Settings & Data')
        ) {
          runtime.fail('Reset All Settings & Data must follow Reset Saved Data in App settings')
        }

        await resetAllSettings.scrollIntoViewIfNeeded()
        await sleep(500)
        await runtime.screenshot(tray, '02f-app-reset-settings.png')

        await resetAllSettings.click()
        await appSettings.getByText('Reset All Settings & Data?', { exact: true }).waitFor()
        await sleep(500)
        await runtime.screenshot(tray, '02g-app-reset-confirmation.png')
        await appSettings.getByRole('button', { name: 'No', exact: true }).click()
      }

      await overlay.getByRole('button', { name: 'Back' }).click()
      await menu.waitFor({ state: 'visible' })
      await sleep(500)
    }

    await menu.getByRole('button', { name: 'Close menu' }).click()
    await menu.waitFor({ state: 'hidden' })

    await tray.getByRole('button', { name: 'Show account QR code' }).click()
    const receive = tray.getByRole('dialog', { name: 'Receive assets' })
    await receive.waitFor({ state: 'visible' })
    const qrCode = receive.getByLabel('Account address QR code')
    await qrCode.waitFor({ state: 'visible' })
    const qrIsContained = await qrCode.evaluate((canvas) => {
      const frame = canvas.parentElement
      if (!frame) return false
      const canvasBounds = canvas.getBoundingClientRect()
      const frameBounds = frame.getBoundingClientRect()
      return (
        canvasBounds.left >= frameBounds.left &&
        canvasBounds.top >= frameBounds.top &&
        canvasBounds.right <= frameBounds.right &&
        canvasBounds.bottom <= frameBounds.bottom
      )
    })
    if (!qrIsContained) runtime.fail('Receive QR code must remain inside its frame')
    await sleep(500)
    await runtime.screenshot(tray, '02h-receive-overlay.png')
    await receive.getByRole('button', { name: 'Back' }).click()
    await receive.waitFor({ state: 'hidden' })

    await tray.getByRole('button', { name: 'Network filter' }).click()
    const networks = tray.getByRole('dialog', { name: 'Networks' })
    await networks.waitFor({ state: 'visible' })
    await sleep(500)
    await runtime.screenshot(tray, '02i-networks-overlay.png')
    await networks.getByRole('button', { name: 'Back' }).click()
    await networks.waitFor({ state: 'hidden' })
  }
}
