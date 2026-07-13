import { anvilChainId } from '../../core/config.ts'
import { harnessOrigin } from '../driver.ts'
import type { VisualStage } from '../types.ts'

export const resetStateStage: VisualStage = {
  name: 'reset harness-owned state',
  async run({ driver }) {
    const state = await driver.getAppState()
    const originIds = new Set<string>()

    Object.entries(state.main?.origins || {}).forEach(([originId, origin]) => {
      if (origin?.name === harnessOrigin) originIds.add(originId)
    })

    Object.values(state.main?.permissions || {}).forEach((permissions) => {
      Object.entries(permissions || {}).forEach(([permissionId, permission]) => {
        if (permission?.origin === harnessOrigin) {
          originIds.add(permissionId)
          if (permission.handlerId) originIds.add(permission.handlerId)
        }
      })
    })

    for (const originId of originIds) await driver.linkSend(driver.tray, 'tray:removeOrigin', originId)

    await driver.trayAction('removeNetwork', { type: 'ethereum', id: anvilChainId })
    await driver.trayAction('setShowTestnets', true)
    await driver.waitForState(
      (candidate) => {
        const networks = candidate.main?.networks?.ethereum || {}
        return candidate.main?.showTestnets === true && !networks[String(anvilChainId)]
      },
      5_000,
      'Harness-owned state did not reset'
    )
  }
}
