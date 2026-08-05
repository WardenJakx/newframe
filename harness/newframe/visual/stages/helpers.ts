import type { Locator, Page } from 'playwright-core'

import type { VisualHarnessRuntime } from '../runtime.ts'
import type { VisualHarnessContext } from '../types.ts'

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

export async function requireAccounts(context: VisualHarnessContext) {
  context.accounts ||= context.driver.findHarnessAccounts(await context.driver.getAppState())
  return context.accounts
}

export async function revealAssetDetailsButton(page: Page, symbol: string) {
  const assetDetails = page.getByRole('button', {
    name: `${symbol} asset details`,
    exact: true
  })

  if (await assetDetails.isVisible({ timeout: 500 }).catch(() => false)) return assetDetails

  const hiddenGroups = [
    page.getByRole('button', { name: /\d+ assets? below 1% hidden/i }),
    page.getByRole('button', { name: /\d+ low value tokens? hidden/i })
  ]

  for (const group of hiddenGroups) {
    if (!(await group.isVisible({ timeout: 500 }).catch(() => false))) continue
    if ((await group.getAttribute('aria-expanded')) !== 'true') await group.click()
    if (await assetDetails.isVisible({ timeout: 500 }).catch(() => false)) break
  }

  return assetDetails
}
