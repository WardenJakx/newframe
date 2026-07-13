import type { VisualStage } from '../types.ts'

export const unlockedHomeStage: VisualStage = {
  name: 'unlocked home',
  async run({ runtime, tray }) {
    await runtime.screenshot(tray, '02-unlocked-home.png')
  }
}
