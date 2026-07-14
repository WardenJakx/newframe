import { anvilChainId } from '../../core/config.ts'
import { harnessOrigin } from '../driver.ts'
import type { VisualStage } from '../types.ts'

export const resetStateStage: VisualStage = {
  name: 'reset harness-owned state',
  async run({ driver }) {
    const dash = await driver.waitForElectronPage('bundle/dash.html')
    await driver.executeCommand(driver.tray, { type: 'wallet.reset', scope: 'saved-data' })
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

    for (const originId of originIds) {
      if (state.main?.origins?.[originId]) {
        await driver.executeCommand(dash, { type: 'origin.remove', originId })
      }
    }

    if (state.main?.networks?.ethereum?.[String(anvilChainId)]) {
      await driver.executeCommand(dash, { type: 'network.remove', chainId: anvilChainId })
    }
    await driver.executeCommand(driver.tray, {
      type: 'settings.update',
      setting: 'show-testnets',
      value: true
    })
    await driver.waitForState(
      (candidate) => {
        const networks = candidate.main?.networks?.ethereum || {}
        const orders = candidate.main?.orders || {}
        return (
          candidate.main?.showTestnets === true &&
          !networks[String(anvilChainId)] &&
          Object.keys(orders).length === 0
        )
      },
      5_000,
      'Harness-owned state did not reset'
    )
  }
}
