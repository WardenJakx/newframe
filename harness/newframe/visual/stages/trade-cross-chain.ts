import {
  FLASH_BASE_CHAIN_ID,
  FLASH_BASE_USDC_ADDRESS
} from '../../../../apps/newframe/src/features/transactions/trade/domain/constants.ts'
import { anvilChainId } from '../../core/config.ts'
import { sleep } from '../../core/utils.ts'
import { wethAddress } from '../driver.ts'
import type { FlashOrder, VisualStage } from '../types.ts'

function assetChainId(
  order: FlashOrder,
  field: 'contraAsset' | 'receiveAsset' | 'spentAsset' | 'targetAsset'
) {
  return Number((order[field] as { chainId?: unknown } | undefined)?.chainId)
}

export const tradeCrossChainStage: VisualStage = {
  name: 'trade cross-chain market and cancel e2e',
  async run({ driver, runtime, tray }) {
    await driver.executeCommand(tray, {
      type: 'network.activation-set',
      chainId: FLASH_BASE_CHAIN_ID,
      enabled: true
    })
    await driver.waitForState(
      (state) => state.main?.networks?.ethereum?.[String(FLASH_BASE_CHAIN_ID)]?.on !== false,
      5_000,
      'Base did not become active for the cross-chain trade'
    )

    const tokenOperationId = crypto.randomUUID()
    await driver.executeCommand(tray, {
      type: 'token.add',
      operationId: tokenOperationId,
      token: {
        address: FLASH_BASE_USDC_ADDRESS,
        chainId: FLASH_BASE_CHAIN_ID,
        decimals: 6,
        logoURI: '',
        name: 'USD Coin',
        symbol: 'USDC'
      }
    })
    const tokenState = await driver.waitForState(
      (state) => {
        const status = state.operations?.[tokenOperationId]?.operation?.status
        return status === 'succeeded' || status === 'failed'
      },
      5_000,
      'Base USDC token add operation did not complete'
    )
    const tokenOperation = tokenState.operations?.[tokenOperationId]?.operation
    if (tokenOperation?.status === 'failed') {
      return driver.fail(tokenOperation.error?.message || 'Base USDC token add operation failed')
    }

    const tradePage = await driver.openTradeTicket()
    await driver.ensureTradeSellSide(tradePage)
    await driver.selectTradeAsset(tradePage, 'target', driver.canonicalAssetId(anvilChainId, wethAddress))
    await driver.selectTradeAsset(
      tradePage,
      'contra',
      driver.canonicalAssetId(FLASH_BASE_CHAIN_ID, FLASH_BASE_USDC_ADDRESS)
    )
    await tradePage.getByLabel('WETH amount', { exact: true }).fill('0.01')
    await tradePage
      .getByRole('button', { name: /Review\/sign/i })
      .waitFor({ state: 'visible', timeout: 20_000 })
    await driver.screenshot(tradePage, '21h-trade-cross-chain-quoted.png')

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
      'Cross-chain market trade did not publish a pending canonical operation'
    )
    const tradeOperationId = Object.entries(pendingState.operations || {}).find(
      ([operationId, entry]) =>
        !priorOperationIds.has(operationId) &&
        entry.operation?.type === 'trade.execute' &&
        entry.operation.status === 'pending'
    )?.[0]
    if (!tradeOperationId) return driver.fail('Cross-chain market trade operation disappeared')

    const signRequest = await driver.waitForCurrentRequest('signTypedData', new Set(), 30_000)
    await driver.screenshot(tray, '21i-trade-cross-chain-sign-review.png')
    await driver.signCurrentSignature(signRequest, '21j-trade-cross-chain-sign-submitted.png')

    const order = await driver.waitForFlashOrder(
      (candidate) =>
        candidate.orderType === 'market' &&
        candidate.status === 'accepted' &&
        candidate.open === true &&
        candidate.cancellable === true &&
        Boolean(candidate.orderId) &&
        !existingOrderIds.has(candidate.orderId || ''),
      15_000,
      'A newly submitted cross-chain market order was not accepted as open and cancellable'
    )
    const orderId = order.orderId || driver.fail('The cross-chain market order has no order id')
    if ('chainId' in order) driver.fail('Cross-chain order retained a top-level chainId')
    if (
      assetChainId(order, 'targetAsset') !== anvilChainId ||
      assetChainId(order, 'contraAsset') !== FLASH_BASE_CHAIN_ID ||
      assetChainId(order, 'spentAsset') !== anvilChainId ||
      assetChainId(order, 'receiveAsset') !== FLASH_BASE_CHAIN_ID
    ) {
      driver.fail('Cross-chain order did not preserve independent asset chains')
    }

    await sleep(4_000)
    const stillAccepted = (await driver.getAppState()).main?.orders?.[orderId]
    if (stillAccepted?.status !== 'accepted' || !stillAccepted.open || !stillAccepted.cancellable) {
      driver.fail('Cross-chain market order did not remain accepted beyond the local fill delay')
    }

    await driver.assertFlashOrderVisible(orderId)
    await driver.screenshot(tray, '21k-trade-cross-chain-accepted.png')
    const cancelRequest = await driver.beginFlashOrderCancellation(orderId)
    await driver.screenshot(tray, '21l-trade-cross-chain-cancel-review.png')
    await driver.signCurrentSignature(cancelRequest, '21m-trade-cross-chain-cancel-submitted.png')

    const cancelled = await driver.waitForFlashOrder(
      (candidate) =>
        candidate.orderId === orderId &&
        candidate.status === 'cancelled' &&
        candidate.open === false &&
        candidate.cancellable === false,
      15_000,
      'The cross-chain market order did not close after signed cancellation'
    )
    runtime.evidence('crossChainTradeOperationId', tradeOperationId)
    runtime.evidence('crossChainOrderId', orderId)
    runtime.evidence('crossChainOrderStatus', String(cancelled.status))
    runtime.evidence('crossChainSpentChainId', assetChainId(cancelled, 'spentAsset'))
    runtime.evidence('crossChainReceiveChainId', assetChainId(cancelled, 'receiveAsset'))
    await driver.clearPanelAndOverlays()
    await driver.assertFlashOrderVisible(orderId)
    await driver.screenshot(tray, '21n-trade-cross-chain-cancelled.png')
  }
}
