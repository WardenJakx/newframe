import type { VisualStage } from '../types.ts'

export const tradeMarketStage: VisualStage = {
  name: 'trade market e2e',
  async run({ driver, runtime, tray }) {
    const tradePage = await driver.openTradeTicket()

    await driver.ensureTradeSellSide(tradePage)
    await tradePage.getByLabel('WETH amount', { exact: true }).fill('0.01')
    await tradePage
      .getByRole('button', { name: /Approve WETH/i })
      .waitFor({ state: 'visible', timeout: 20_000 })
    await driver.screenshot(tradePage, '21a-trade-market-quoted.png')
    const priorOperationIds = new Set(Object.keys((await driver.getAppState()).operations || {}))
    await tradePage.getByRole('button', { name: /Approve WETH/i }).click()

    const pendingState = await driver.waitForState(
      (state) =>
        Object.entries(state.operations || {}).some(
          ([operationId, entry]) =>
            !priorOperationIds.has(operationId) &&
            entry.operation?.type === 'trade.execute' &&
            entry.operation.status === 'pending'
        ),
      5_000,
      'Market trade did not publish a pending canonical operation'
    )
    const marketOperationEntry = Object.entries(pendingState.operations || {}).find(
      ([operationId, entry]) =>
        !priorOperationIds.has(operationId) &&
        entry.operation?.type === 'trade.execute' &&
        entry.operation.status === 'pending'
    )
    const marketOperationId =
      marketOperationEntry?.[0] || driver.fail('Pending market trade operation disappeared')

    const approveRequest = await driver.waitForCurrentRequest('transaction', new Set(), 30_000)
    await driver.screenshot(tray, '21b-trade-market-approve-review.png')

    const gasSettings = tray.getByRole('button', { name: /Show gas fee settings/i })
    await gasSettings.waitFor({ state: 'visible' })
    if ((await gasSettings.getAttribute('aria-expanded')) !== 'false') {
      driver.fail('Gas settings must default to the compact collapsed state')
    }

    await tray.getByRole('button', { name: /Calldata digest/i }).click()
    await tray.getByText('Full calldata', { exact: true }).waitFor({ state: 'visible' })
    const rawDataFits = await tray.getByText('Full calldata', { exact: true }).evaluate(() => {
      const root = document.documentElement
      return root.scrollWidth <= root.clientWidth
    })
    if (!rawDataFits) driver.fail('Inline calldata must not overflow the tray viewport')
    if (await tray.getByText('Raw Transaction', { exact: true }).isVisible()) {
      driver.fail('Calldata disclosure must not open the removed raw transaction view')
    }
    await driver.screenshot(tray, '21b1-trade-market-inline-calldata.png')
    await tray.getByRole('button', { name: /Calldata digest/i }).click()
    await tray.getByText('Estimated changes', { exact: true }).waitFor({ state: 'visible' })

    await driver.signCurrentTransaction(approveRequest, '21c-trade-market-approve-submitted.png', [
      '21b-trade-market-approve-warning.png',
      '21c-trade-market-approve-post-sign-warning.png'
    ])

    await tradePage
      .getByRole('button', { name: /Review\/sign/i })
      .waitFor({ state: 'visible', timeout: 20_000 })
    await driver.screenshot(tradePage, '21d-trade-market-ready-to-sign.png')
    const existingOrderIds = new Set(Object.keys((await driver.getAppState()).main?.orders || {}))
    await tradePage.getByRole('button', { name: /Review\/sign/i }).click()

    const signRequest = await driver.waitForCurrentRequest('signTypedData', new Set(), 30_000)
    await driver.screenshot(tray, '21e-trade-market-sign-review.png')
    await driver.signCurrentSignature(signRequest, '21f-trade-market-sign-submitted.png')

    const order = await driver.waitForFlashOrder(
      (order) =>
        order.orderType === 'market' &&
        order.status === 'filled' &&
        Boolean(order.orderId) &&
        !existingOrderIds.has(order.orderId || ''),
      30_000,
      'A newly submitted market Flash order did not fill'
    )
    const orderId = order.orderId
    if (!orderId) return driver.fail('The new market Flash order has no order id')
    const terminalState = await driver.waitForState(
      (state) => {
        const status = state.operations?.[marketOperationId]?.operation?.status
        return status === 'succeeded' || status === 'failed'
      },
      15_000,
      'Market trade operation did not reach a terminal canonical state'
    )
    const operation = terminalState.operations?.[marketOperationId]?.operation
    if (operation?.status === 'failed') {
      return driver.fail(operation.error?.message || 'Canonical market trade operation failed')
    }
    if (!operation?.entityRefs?.some((reference) => reference.type === 'order' && reference.id === orderId)) {
      return driver.fail('Successful market trade operation did not reference its order')
    }
    const transactionHash = operation.entityRefs.find((reference) => reference.type === 'transaction')?.id
    if (!transactionHash) return driver.fail('Market trade operation did not retain its approval transaction')
    const activityState = await driver.waitForState(
      (state) => Boolean(state.main?.activity?.[transactionHash]),
      15_000,
      'Market approval transaction did not appear in canonical activity'
    )
    const activity = activityState.main?.activity?.[transactionHash]
    if (!activity || activity.status === 'reverted') {
      return driver.fail('Market approval transaction is missing or reverted in canonical activity')
    }
    runtime.evidence('marketOperationId', marketOperationId)
    runtime.evidence('marketOrderId', orderId)
    runtime.evidence('marketOrderStatus', String(order.status))
    runtime.evidence('marketApprovalTransactionHash', transactionHash)
    runtime.evidence('marketApprovalActivityStatus', activity.status || null)
    await driver.assertFlashOrderVisible(orderId)
    await driver.screenshot(tray, '21g-trade-market-filled.png')
    await driver.clearPanelAndOverlays()
  }
}
