import { readHarnessPassword } from '../../core/config.ts'
import type { VisualStage } from '../types.ts'

export const unlockStage: VisualStage = {
  name: 'unlock',
  async run({ runtime, tray }) {
    const password = readHarnessPassword()
    runtime.log(`unlock attempt has password: ${password.length > 0}`)
    if (!password) runtime.fail('Newframe unlock password is not configured')

    const dialog = tray.getByRole('dialog', { name: 'Unlock Newframe' })
    const passwordInput = dialog.getByRole('textbox', { name: 'Newframe password' })
    const unlockButton = dialog.getByRole('button', { name: 'Unlock' })
    const mainMenu = tray.getByRole('button', { name: 'Main menu' })

    try {
      await passwordInput.fill(password)
      runtime.log(`unlock input populated: ${(await passwordInput.inputValue()).length > 0}`)
      runtime.log(`unlock button enabled: ${!(await unlockButton.isDisabled())}`)
      await unlockButton.click()
      await mainMenu.waitFor({ state: 'visible', timeout: runtime.uiTimeoutMs })
    } catch (err) {
      const diagnostics = {
        buttonDisabled: await unlockButton.isDisabled().catch(() => null),
        dialogText: await dialog.innerText().catch(() => '<unavailable>'),
        dialogVisible: await dialog.isVisible().catch(() => false),
        inputPopulated: await passwordInput
          .inputValue()
          .then((value) => value.length > 0)
          .catch(() => false),
        mainMenuVisible: await mainMenu.isVisible().catch(() => false)
      }
      runtime.log(`unlock failed: ${JSON.stringify(diagnostics)}`)
      throw err
    }
  }
}
