import { anvilChainId } from '../../core/config.ts'
import { harnessOrigin } from '../driver.ts'
import type { VisualStage } from '../types.ts'

export const resetStateStage: VisualStage = {
  name: 'reset harness-owned state',
  async run({ driver }) {
    const operationId = crypto.randomUUID()
    await driver.executeCommand(driver.tray, {
      type: 'wallet.reset',
      operationId,
      scope: 'saved-data'
    })
    const state = await driver.waitForState(
      (candidate) => {
        const status = candidate.operations?.[operationId]?.operation?.status
        return status === 'succeeded' || status === 'failed'
      },
      5_000,
      'Saved-data reset operation did not complete'
    )
    const resetOperation = state.operations?.[operationId]?.operation
    if (resetOperation?.status === 'failed') {
      driver.fail(resetOperation.error?.message || 'Saved-data reset failed')
    }
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
        await driver.executeCommand(driver.tray, { type: 'origin.remove', originId })
      }
    }

    if (state.main?.networks?.ethereum?.[String(anvilChainId)]) {
      await driver.executeCommand(driver.tray, { type: 'network.remove', chainId: anvilChainId })
    }
    await driver.setShowTestnets(true)
    await driver.waitForState(
      (candidate) => {
        const networks = candidate.main?.networks?.ethereum || {}
        const orders = candidate.main?.orders || {}
        return !networks[String(anvilChainId)] && Object.keys(orders).length === 0
      },
      5_000,
      'Harness-owned state did not reset'
    )
  }
}
