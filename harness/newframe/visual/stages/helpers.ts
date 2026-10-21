import type { Locator, Page } from 'playwright-core'

import { LOCAL_MARKET_FILL_DELAY_MS } from '../../../../apps/newframe/scripts/local-trade/constants.ts'
import { anvilBlockTimeSeconds } from '../../core/config.ts'
import type { VisualHarnessRuntime } from '../runtime.ts'
import type { VisualHarnessContext } from '../types.ts'

/**
 * How long an order must stay open to prove the local Flash service will not fill it: its market fill delay,
 * one Anvil block to mine the fill, and slack for the fill to reach canonical state.
 */
export const localMarketFillSettleMs = LOCAL_MARKET_FILL_DELAY_MS + anvilBlockTimeSeconds * 1_000 + 500

export async function assertInsideViewport(locator: Locator, runtime: VisualHarnessRuntime, label: string) {
  const bounds = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return {
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth
    }
  })

  if (
    bounds.left < 0 ||
    bounds.top < 0 ||
    bounds.right > bounds.viewportWidth ||
    bounds.bottom > bounds.viewportHeight
  ) {
    runtime.fail(`${label} must remain inside the viewport; found ${JSON.stringify(bounds)}`)
  }
}

/**
 * Resolves once the page's running enter/exit animations and transitions finish, so a capture or style
 * read sees the settled UI. Infinite animations (spinners) never settle and are ignored.
 */
export async function waitForAnimations(page: Page) {
  await page.evaluate(async () => {
    // A just-triggered transition starts on the next frame.
    await new Promise(requestAnimationFrame)
    const finite = document
      .getAnimations()
      .filter((animation) => animation.effect?.getComputedTiming().endTime !== Infinity)
    await Promise.all(finite.map((animation) => animation.finished.catch(() => undefined)))
  })
}

export async function requireAccounts(context: VisualHarnessContext) {
  context.accounts ??= context.driver.findHarnessAccounts(await context.driver.getAppState())
  return context.accounts
}

export async function revealAssetDetailsButton(page: Page, symbol: string) {
  const assetDetails = page.getByRole('button', {
    name: `${symbol} asset details`,
    exact: true
  })

  if (await assetDetails.isVisible().catch(() => false)) {
    return assetDetails
  }

  const hiddenGroups = [
    page.getByRole('button', { name: /\d+ assets? below 1% hidden/i }),
    page.getByRole('button', { name: /\d+ low value tokens? hidden/i })
  ]

  for (const group of hiddenGroups) {
    if (!(await group.isVisible().catch(() => false))) {
      continue
    }
    if ((await group.getAttribute('aria-expanded')) !== 'true') {
      await group.click()
    }
    if (await assetDetails.isVisible().catch(() => false)) {
      break
    }
  }

  return assetDetails
}
