import type { VisualStage } from '../types.ts'

export const trayReadinessStage: VisualStage = {
  name: 'tray readiness',
  async run({ driver, tray }) {
    await driver.assertColorTokens(tray, 'Tray')
  }
}
