import { anvilChainId } from '../../core/config.ts'
import { wethAddress } from '../driver.ts'
import type { VisualStage } from '../types.ts'

export const tradeTicketStage: VisualStage = {
  name: 'trade ticket visuals',
  async run({ driver }) {
    const tradePage = await driver.openTradeTicket()
    await driver.assertColorTokens(tradePage, 'Dapp')
    await driver.assertTradeTicketVisualControls(tradePage)
    await driver.screenshot(tradePage, '10a-trade-market-open.png')

    await tradePage.getByRole('button', { name: /Switch to (BUY|SELL)/ }).click()
    await tradePage.getByRole('button', { name: /Switch to (BUY|SELL)/ }).waitFor({
      state: 'visible',
      timeout: 5_000
    })
    await driver.screenshot(tradePage, '10b-trade-direction-switched.png')

    await tradePage.getByRole('button', { name: /Select target asset/i }).click()
    await tradePage.getByRole('option', { name: /\bWETH\b.*\$0\.00/i }).waitFor({
      state: 'visible',
      timeout: 5_000
    })
    await driver.screenshot(tradePage, '10c-trade-target-asset-menu.png')

    await tradePage.getByRole('button', { name: /Select target asset/i }).click()
    await tradePage.getByRole('button', { name: /Select contra asset/i }).click()
    await tradePage.getByRole('option', { name: /\bUSDC\b.*\$0\.00/i }).waitFor({
      state: 'visible',
      timeout: 5_000
    })
    await driver.screenshot(tradePage, '10d-trade-contra-asset-menu.png')

    await tradePage.getByRole('button', { name: /Select contra asset/i }).click()
    await tradePage.getByRole('tab', { name: 'Limit' }).click()
    const limitOrderType = tradePage.getByLabel('Limit order type')
    await limitOrderType.waitFor({ state: 'visible', timeout: 5_000 })

    const box = await limitOrderType.boundingBox()
    if (!box || box.width < 300) driver.fail('Limit order type selector is not rendering as a full-width row')
    await driver.screenshot(tradePage, '10e-trade-limit-order-type-row.png')

    await driver.openDappLauncherRoute(driver.launcherRoute('send'))
    await driver.waitForDappRoute(tradePage, 'send')
    await tradePage.getByRole('textbox', { name: 'Recipient' }).waitFor({ state: 'visible', timeout: 15_000 })
    const resetSendAmount = await tradePage.getByRole('textbox', { name: 'Amount' }).inputValue()
    if (resetSendAmount !== '1') driver.fail(`Send relaunch did not reset amount; found "${resetSendAmount}"`)
    await driver.screenshot(tradePage, '10f-relaunch-send-reset.png')

    await driver.openDappLauncherRoute(
      driver.launcherRoute('trade', driver.canonicalAssetId(anvilChainId, wethAddress))
    )
    await driver.waitForDappRoute(tradePage, 'trade')
    await tradePage.getByRole('tab', { name: 'Market' }).waitFor({ state: 'visible', timeout: 15_000 })
    await driver.assertTradeTicketVisualControls(tradePage)
    await driver.screenshot(tradePage, '10g-relaunch-trade-reset.png')
    await tradePage
      .getByRole('button', { name: 'Close Trade' })
      .click()
      .catch(() => undefined)
  }
}
