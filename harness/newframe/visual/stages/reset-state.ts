import { anvilChainId } from '../../core/config.ts'
import { harnessExtensionId } from '../../core/extension.ts'
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
      driver.fail(resetOperation.error?.message ?? 'Saved-data reset failed')
    }
    const originIds = new Set<string>()

    Object.entries(state.main?.origins ?? {}).forEach(([originId, origin]) => {
      if (origin.name === harnessOrigin) {
        originIds.add(originId)
      }
    })

    Object.values(state.main?.accountAccessGrants ?? {}).forEach((grants) => {
      Object.entries(grants).forEach(([grantId, grant]) => {
        if (grant.origin === harnessOrigin) {
          originIds.add(grantId)
          if (grant.requestId) {
            originIds.add(grant.requestId)
          }
        }
      })
    })

    for (const originId of originIds) {
      if (state.main?.origins?.[originId]) {
        await driver.executeCommand(driver.tray, { type: 'origin.remove', originId })
      }
    }

    if (state.main?.knownExtensions?.[harnessExtensionId] !== undefined) {
      await driver.executeCommand(driver.tray, { type: 'extension.forget', extensionId: harnessExtensionId })
    }

    if (state.main?.chains?.ethereum?.[String(anvilChainId)]) {
      await driver.executeCommand(driver.tray, { type: 'chain.remove', chainId: anvilChainId })
    }
    await driver.setShowTestnets(true)
    await driver.waitForState(
      (candidate) => {
        const chains = (candidate.main?.chains?.ethereum ?? {}) as Record<string, unknown>
        const orders = candidate.main?.orders ?? {}
        return (
          !chains[String(anvilChainId)] &&
          Object.keys(orders).length === 0 &&
          candidate.main?.knownExtensions?.[harnessExtensionId] === undefined
        )
      },
      5_000,
      'Harness-owned state did not reset'
    )
  }
}
