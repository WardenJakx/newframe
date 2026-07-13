import type { VisualStage } from '../types.ts'

export const lockScreenStage: VisualStage = {
  name: 'lock screen',
  async run({ runtime, tray }) {
    const unlockDialog = tray.getByRole('dialog', { name: 'Unlock Newframe' })
    await unlockDialog.waitFor({ state: 'visible', timeout: runtime.uiTimeoutMs })
    await runtime.screenshot(tray, '01-lock-screen.png')
  }
}
