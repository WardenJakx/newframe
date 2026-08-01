import { sleep } from '../../core/utils.ts'
import type { VisualStage } from '../types.ts'

export const tradeLimitStage: VisualStage = {
  name: 'trade non-market e2e',
  async run({ driver, runtime, tray }) {
    const tradePage = await driver.openTradeTicket()

    await driver.ensureTradeSellSide(tradePage)
    await tradePage.getByRole('tab', { name: 'Limit' }).click()
    await tradePage.getByLabel('Limit price').fill('2500')
    await tradePage.getByLabel('WETH amount', { exact: true }).fill('0.01')
    await tradePage
      .getByRole('button', { name: /Review\/sign/i })
      .waitFor({ state: 'visible', timeout: 20_000 })
    await driver.screenshot(tradePage, '22a-trade-limit-quoted.png')
    const beforeSubmit = await driver.getAppState()
    const existingOrderIds = new Set(Object.keys(beforeSubmit.main?.orders || {}))
    const priorOperationIds = new Set(Object.keys(beforeSubmit.operations || {}))
    await tradePage.getByRole('button', { name: /Review\/sign/i }).click()

    const pendingState = await driver.waitForState(
      (state) =>
        Object.entries(state.operations || {}).some(
          ([operationId, entry]) =>
            !priorOperationIds.has(operationId) &&
            entry.operation?.type === 'trade.execute' &&
            entry.operation.status === 'pending'
        ),
      5_000,
      'Limit trade did not publish a pending canonical operation'
    )
    const limitOperationEntry = Object.entries(pendingState.operations || {}).find(
      ([operationId, entry]) =>
        !priorOperationIds.has(operationId) &&
        entry.operation?.type === 'trade.execute' &&
        entry.operation.status === 'pending'
    )
    const limitOperationId =
      limitOperationEntry?.[0] || driver.fail('Pending limit trade operation disappeared')

    const signRequest = await driver.waitForCurrentRequest('signTypedData', new Set(), 30_000)
    await driver.screenshot(tray, '22b-trade-limit-sign-review.png')
    await driver.signCurrentSignature(signRequest, '22c-trade-limit-sign-submitted.png')

    const order = await driver.waitForFlashOrder(
      (candidate) =>
        candidate.orderType === 'limit' &&
        candidate.status === 'accepted' &&
        Boolean(candidate.open) &&
        Boolean(candidate.orderId) &&
        !existingOrderIds.has(candidate.orderId || ''),
      15_000,
      'A newly submitted limit Flash order was not accepted as open'
    )

    await sleep(4_000)

    const latest = await driver.getAppState()
    const stored = order.orderId ? latest.main?.orders?.[order.orderId] : undefined
    if (!stored?.open || stored.status !== 'accepted') {
      driver.fail('Limit Flash order filled or closed unexpectedly')
    }

    const orderId = order.orderId
    if (!orderId) return driver.fail('The new limit Flash order has no order id')
    const terminalState = await driver.waitForState(
      (state) => {
        const status = state.operations?.[limitOperationId]?.operation?.status
        return status === 'succeeded' || status === 'failed'
      },
      15_000,
      'Limit trade operation did not reach a terminal canonical state'
    )
    const operation = terminalState.operations?.[limitOperationId]?.operation
    if (operation?.status === 'failed') {
      return driver.fail(operation.error?.message || 'Canonical limit trade operation failed')
    }
    if (!operation?.entityRefs?.some((reference) => reference.type === 'order' && reference.id === orderId)) {
      return driver.fail('Successful limit trade operation did not reference its order')
    }
    runtime.evidence('limitOperationId', limitOperationId)
    runtime.evidence('limitOrderId', orderId)
    runtime.evidence('limitOrderStatus', String(stored?.status))
    await driver.assertFlashOrderVisible(orderId)
    await driver.screenshot(tray, '22d-trade-limit-open.png')
    await driver.clearPanelAndOverlays()
  }
}
