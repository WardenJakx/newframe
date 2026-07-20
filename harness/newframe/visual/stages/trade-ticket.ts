import { anvilChainId } from '../../core/config.ts'
import { wethAddress } from '../driver.ts'
import type { VisualStage } from '../types.ts'
import type { Locator } from 'playwright-core'

async function fieldPartsOverlap(input: Locator) {
  return input.evaluate((element) => {
    const field = element.closest('label')
    const label = field?.firstElementChild
    if (!field || !label) return true

    const inputBounds = element.getBoundingClientRect()
    const labelBounds = label.getBoundingClientRect()
    return !(
      inputBounds.right <= labelBounds.left ||
      inputBounds.left >= labelBounds.right ||
      inputBounds.bottom <= labelBounds.top ||
      inputBounds.top >= labelBounds.bottom
    )
  })
}

export const tradeTicketStage: VisualStage = {
  name: 'trade ticket visuals',
  async run({ driver }) {
    const tradePage = await driver.openDefaultTradeTicket()
    await driver.assertColorTokens(tradePage, 'Side tray')
    await driver.assertTradeTicketVisualControls(tradePage)
    const targetAsset = await tradePage.getByRole('button', { name: /Select target asset/i }).textContent()
    const contraAsset = await tradePage.getByRole('button', { name: /Select contra asset/i }).textContent()
    if (!targetAsset?.includes('WETH')) {
      driver.fail(`Default Trade target should be WETH; found ${targetAsset || 'nothing'}`)
    }
    if (!contraAsset?.includes('USDC')) {
      driver.fail(`Default Trade contra should be USDC; found ${contraAsset || 'nothing'}`)
    }
    await driver.assertTradeBalanceDirectionColor(tradePage)
    await driver.screenshot(tradePage, '10a-trade-market-open.png')

    await tradePage.getByRole('button', { name: /Advanced/ }).click()
    const slippage = tradePage.getByLabel('Slippage')
    await slippage.waitFor({ state: 'visible', timeout: 5_000 })
    if ((await slippage.inputValue()) !== '') driver.fail('Automatic market slippage should start empty')
    if ((await slippage.getAttribute('placeholder')) !== 'Automatic') {
      driver.fail('Automatic market slippage placeholder is missing')
    }
    if (await fieldPartsOverlap(slippage)) driver.fail('Max slippage label overlaps its input')
    await driver.screenshot(tradePage, '10a1-trade-market-advanced-automatic.png')
    await tradePage.getByRole('button', { name: /Advanced/ }).click()

    await tradePage.getByRole('button', { name: /Switch to (BUY|SELL)/ }).click()
    await tradePage.getByRole('button', { name: /Switch to (BUY|SELL)/ }).waitFor({
      state: 'visible',
      timeout: 5_000
    })
    await driver.assertTradeBalanceDirectionColor(tradePage)
    await driver.screenshot(tradePage, '10b-trade-direction-switched.png')

    await tradePage.getByRole('button', { name: /Select target asset/i }).click()
    await tradePage.getByRole('option', { name: /\bWETH\b/i }).waitFor({
      state: 'visible',
      timeout: 5_000
    })
    await driver.screenshot(tradePage, '10c-trade-target-asset-menu.png')

    await tradePage.getByRole('button', { name: /Select target asset/i }).click()
    await tradePage.getByRole('button', { name: /Select contra asset/i }).click()
    await tradePage.getByRole('option', { name: /\bUSDC\b/i }).waitFor({
      state: 'visible',
      timeout: 5_000
    })
    await driver.screenshot(tradePage, '10d-trade-contra-asset-menu.png')

    await tradePage.getByRole('button', { name: /Select contra asset/i }).click()
    await tradePage.getByRole('tab', { name: 'Limit' }).click()
    const limitPrice = tradePage.getByLabel('Limit price')
    await limitPrice.waitFor({ state: 'visible', timeout: 5_000 })
    if ((await limitPrice.getAttribute('aria-required')) !== 'true') {
      driver.fail('Standalone limit price is not marked required')
    }
    if (await fieldPartsOverlap(limitPrice)) driver.fail('Limit price label overlaps its input')

    if ((await tradePage.getByLabel('Limit order type').count()) > 0) {
      driver.fail('Trade ticket still exposes the removed limit subtype selector')
    }
    await tradePage.getByRole('button', { name: /Advanced/ }).click()
    const timeInForce = tradePage.getByLabel('Time in force')
    await timeInForce.waitFor({ state: 'visible', timeout: 5_000 })
    if ((await timeInForce.inputValue()) !== 'gtc') driver.fail('Time in force should default to GTC')
    await driver.screenshot(tradePage, '10e-trade-limit-advanced.png')

    await tradePage.getByRole('tab', { name: 'TP/SL' }).click()
    const takeProfitTrigger = tradePage.getByLabel('Take-profit trigger price')
    const takeProfitLimit = tradePage.getByLabel('Take-profit limit price')
    await takeProfitTrigger.waitFor({ state: 'visible', timeout: 5_000 })
    await takeProfitLimit.waitFor({ state: 'visible', timeout: 5_000 })
    if ((await takeProfitTrigger.getAttribute('aria-required')) !== 'true') {
      driver.fail('Take-profit trigger is not marked required')
    }
    if ((await takeProfitLimit.getAttribute('aria-required')) !== null) {
      driver.fail('Optional take-profit limit is marked required')
    }
    await tradePage.getByLabel('WETH amount', { exact: true }).fill('0.01')
    if ((await takeProfitTrigger.getAttribute('aria-invalid')) !== 'true') {
      driver.fail('Missing take-profit trigger is not marked invalid')
    }
    if (!(await takeProfitTrigger.evaluate((input) => input.closest('label')?.dataset.invalid === 'true'))) {
      driver.fail('Missing take-profit trigger does not have an error outline')
    }
    for (const [name, input] of [
      ['Take-profit trigger', takeProfitTrigger],
      ['Take-profit limit', takeProfitLimit]
    ] as const) {
      if (await fieldPartsOverlap(input)) driver.fail(`${name} label overlaps its input`)
    }
    const triggerHasInnerOutline = await takeProfitTrigger.evaluate((input) => {
      const style = getComputedStyle(input)
      return Number.parseFloat(style.borderTopWidth) > 0 || style.boxShadow !== 'none'
    })
    if (triggerHasInnerOutline) driver.fail('Invalid trigger input duplicates the Field error outline')
    await driver.screenshot(tradePage, '10f-trade-tp-sl.png')

    await tradePage.getByRole('tab', { name: 'Stop' }).click()
    const stopTrigger = tradePage.getByLabel('Stop trigger price')
    const stopLimit = tradePage.getByLabel('Stop limit price')
    await stopTrigger.waitFor({ state: 'visible', timeout: 5_000 })
    await stopLimit.waitFor({ state: 'visible', timeout: 5_000 })
    if (await fieldPartsOverlap(stopTrigger)) driver.fail('Stop trigger label overlaps its input')
    if (await fieldPartsOverlap(stopLimit)) driver.fail('Stop limit label overlaps its input')
    await driver.screenshot(tradePage, '10g-trade-stop.png')

    await tradePage.getByRole('tab', { name: 'TWAP' }).click()
    const durationDays = tradePage.getByLabel('TWAP duration days')
    const durationHours = tradePage.getByLabel('TWAP duration hours')
    const durationMinutes = tradePage.getByLabel('TWAP duration minutes')
    await durationDays.waitFor({ state: 'visible', timeout: 5_000 })
    await durationHours.waitFor({ state: 'visible', timeout: 5_000 })
    await durationMinutes.waitFor({ state: 'visible', timeout: 5_000 })
    for (const [name, input] of [
      ['TWAP days', durationDays],
      ['TWAP hours', durationHours],
      ['TWAP minutes', durationMinutes]
    ] as const) {
      if (await fieldPartsOverlap(input)) driver.fail(`${name} label overlaps its input`)
    }
    await tradePage.getByRole('button', { name: /Advanced/ }).click()
    const segments = tradePage.getByLabel('TWAP segments')
    const maxPriceImpact = tradePage.getByLabel('Maximum price impact')
    await segments.waitFor({ state: 'visible', timeout: 5_000 })
    await maxPriceImpact.waitFor({ state: 'visible', timeout: 5_000 })
    for (const [name, input] of [
      ['Segments', segments],
      ['Maximum price impact', maxPriceImpact]
    ] as const) {
      if ((await input.inputValue()) !== '') driver.fail(`${name} should start empty for Automatic`)
      if ((await input.getAttribute('placeholder')) !== 'Automatic') {
        driver.fail(`${name} Automatic placeholder is missing`)
      }
    }
    await driver.screenshot(tradePage, '10h-trade-twap-advanced.png')

    await driver.openSideTrayRoute(driver.sideTrayRoute('send'))
    await driver.waitForSideTrayRoute(tradePage, 'send')
    await tradePage.getByRole('textbox', { name: 'Recipient' }).waitFor({ state: 'visible', timeout: 15_000 })
    const resetSendAmount = await tradePage.getByRole('textbox', { name: 'Amount' }).inputValue()
    if (resetSendAmount !== '1') driver.fail(`Send relaunch did not reset amount; found "${resetSendAmount}"`)
    await driver.screenshot(tradePage, '10i-relaunch-send-reset.png')

    await driver.openSideTrayRoute(
      driver.sideTrayRoute('trade', driver.canonicalAssetId(anvilChainId, wethAddress))
    )
    await driver.waitForSideTrayRoute(tradePage, 'trade')
    await tradePage.getByRole('tab', { name: 'Market' }).waitFor({ state: 'visible', timeout: 15_000 })
    await driver.assertTradeTicketVisualControls(tradePage)
    await driver.screenshot(tradePage, '10j-relaunch-trade-reset.png')
    await Promise.all([
      tradePage.waitForEvent('close'),
      tradePage.getByRole('button', { name: 'Close Trade' }).click()
    ])
  }
}
