import type { ElectronApplication, Page } from 'playwright-core'

import type {
  AppCommand,
  AppQuery,
  ResultForCommand,
  ResultForQuery
} from '../../../apps/newframe/resources/bridge/operations.ts'
import { anvilChainId } from '../core/config.ts'
import { sleep, withTimeout } from '../core/utils.ts'
import type { AnvilClient } from './anvil-client.ts'
import type { AccountInfo, AppState, CurrentRequest, FlashOrder, HarnessAccounts } from './types.ts'
import type { VisualHarnessRuntime } from './runtime.ts'

export const harnessOrigin = 'newframe-contracts.local'
export const harnessAccountAddress = '0x35f9179059a691d8beecf82fe112f7277e018588'
export const nativeCurrencyAddress = '0x0000000000000000000000000000000000000000'
export const wethAddress = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
export const oneEthWei = 1_000_000_000_000_000_000n

const finalRequestStatuses = new Set(['confirmed', 'declined', 'error', 'success'])

type OperationResult = { ok: true; [key: string]: unknown } | { ok: false; error: string; message?: string }

type HarnessHost = {
  executeCommand(command: AppCommand): Promise<OperationResult>
  executeQuery(query: AppQuery): Promise<OperationResult>
}

export async function waitForElectronPage(
  app: ElectronApplication,
  urlPart: string,
  runtime: VisualHarnessRuntime,
  timeoutMs = runtime.uiTimeoutMs
) {
  const started = Date.now()
  let lastLog = started

  while (Date.now() - started < timeoutMs) {
    const page = app.windows().find((candidate) => candidate.url().includes(urlPart))
    if (page) return page

    if (Date.now() - lastLog > 2_500) {
      lastLog = Date.now()
      const urls = app.windows().map((candidate) => candidate.url() || '<blank>')
      runtime.log(`waiting for ${urlPart}; pages: ${urls.join(', ') || '<none>'}`)
    }

    await sleep(250)
  }

  return runtime.fail(`Timed out waiting for Electron page containing ${urlPart}`)
}

export class NewframeDriver {
  readonly anvil: AnvilClient
  readonly app: ElectronApplication
  readonly runtime: VisualHarnessRuntime
  readonly tray: Page

  constructor(app: ElectronApplication, tray: Page, runtime: VisualHarnessRuntime, anvil: AnvilClient) {
    this.app = app
    this.tray = tray
    this.runtime = runtime
    this.anvil = anvil
  }

  screenshot(page: Page, filename: string) {
    return this.runtime.screenshot(page, filename)
  }

  fail(message: string): never {
    return this.runtime.fail(message)
  }

  async waitForElectronPage(urlPart: string, timeoutMs = this.runtime.uiTimeoutMs) {
    return waitForElectronPage(this.app, urlPart, this.runtime, timeoutMs)
  }

  async assertColorTokens(page: Page, renderer: string) {
    const timeout = this.runtime.uiTimeoutMs
    await withTimeout(page.waitForLoadState('load', { timeout }), `${renderer} load state`, timeout)
    const evaluation = page.evaluate(() => {
      const rootStyle = getComputedStyle(document.documentElement)
      const semanticValue = rootStyle.getPropertyValue('--color-bg-primary').trim()
      const primitiveValue = rootStyle.getPropertyValue('--color-plum-950').trim()
      const actionValue = rootStyle.getPropertyValue('--color-action-primary').trim()
      const semanticProbe = document.createElement('div')
      const primitiveProbe = document.createElement('div')
      const alphaProbe = document.createElement('div')

      semanticProbe.style.backgroundColor = 'var(--color-bg-primary)'
      primitiveProbe.style.backgroundColor = 'var(--color-plum-950)'
      alphaProbe.style.backgroundColor = 'color-mix(in srgb, var(--color-action-primary) 12%, transparent)'
      semanticProbe.style.display = primitiveProbe.style.display = alphaProbe.style.display = 'none'
      document.body.append(semanticProbe, primitiveProbe, alphaProbe)

      const semanticColor = getComputedStyle(semanticProbe).backgroundColor
      const primitiveColor = getComputedStyle(primitiveProbe).backgroundColor
      const alphaColor = getComputedStyle(alphaProbe).backgroundColor
      semanticProbe.remove()
      primitiveProbe.remove()
      alphaProbe.remove()

      return {
        actionValue,
        alphaColor,
        colorMixSupported: CSS.supports(
          'background-color',
          'color-mix(in srgb, rgb(0, 210, 190) 12%, transparent)'
        ),
        primitiveColor,
        primitiveValue,
        semanticColor,
        semanticValue
      }
    })
    const result = await withTimeout(evaluation, `${renderer} color-token evaluation`, timeout)

    if (!result.semanticValue || !result.primitiveValue || !result.actionValue) {
      this.fail(`${renderer} is missing generated color custom properties: ${JSON.stringify(result)}`)
    }
    if (result.semanticColor !== result.primitiveColor) {
      this.fail(`${renderer} semantic background does not resolve to its primitive`)
    }
    if (!result.colorMixSupported || !result.alphaColor || result.alphaColor === 'rgba(0, 0, 0, 0)') {
      this.fail(`${renderer} does not resolve color-mix() alpha tokens`)
    }
  }

  canonicalAssetId(chainId: number, address: string) {
    return `${chainId}:${address.toLowerCase()}`
  }

  sideTrayRoute(route: 'send' | 'trade', assetId = '') {
    return assetId ? `/${route}?assetId=${encodeURIComponent(assetId)}` : `/${route}`
  }

  async waitForSideTrayRoute(page: Page, route: 'send' | 'trade') {
    await page.waitForURL((url) => url.hash.startsWith(`#/${route}`), { timeout: this.runtime.uiTimeoutMs })
  }

  async executeCommand<TCommand extends AppCommand>(page: Page, command: TCommand) {
    const result = await page.evaluate<OperationResult, unknown>(async (command) => {
      const host = (window as typeof window & { __NEWFRAME_HOST__?: HarnessHost }).__NEWFRAME_HOST__

      if (!host) throw new Error('Newframe host bridge is not available')
      return host.executeCommand(command as AppCommand)
    }, command)

    if (!result.ok) {
      const failure = result as { error: string; message?: string }
      throw new Error(
        `${command.type} failed: ${failure.error}${failure.message ? ` (${failure.message})` : ''}`
      )
    }

    return result as ResultForCommand<TCommand>
  }

  async executeQuery<TQuery extends AppQuery>(page: Page, query: TQuery) {
    const result = await page.evaluate<OperationResult, unknown>(async (query) => {
      const host = (window as typeof window & { __NEWFRAME_HOST__?: HarnessHost }).__NEWFRAME_HOST__

      if (!host) throw new Error('Newframe host bridge is not available')
      return host.executeQuery(query as AppQuery)
    }, query)

    if (!result.ok) {
      const failure = result as { error: string; message?: string }
      throw new Error(
        `${query.type} failed: ${failure.error}${failure.message ? ` (${failure.message})` : ''}`
      )
    }

    return result as ResultForQuery<TQuery>
  }

  approveAccessRequest(request: CurrentRequest) {
    return this.executeCommand(this.tray, {
      type: 'request.access-resolve',
      requestId: request.handlerId,
      approved: true
    })
  }

  openAddChainReview(request: CurrentRequest) {
    return this.executeCommand(this.tray, {
      type: 'request.add-chain-review',
      requestId: request.handlerId
    })
  }

  async approveAddChainRequest() {
    const review = this.tray.getByRole('dialog', { name: 'Add Chain' })
    await review.getByRole('button', { name: 'Add chain' }).click()
    await review.waitFor({ state: 'hidden', timeout: 10_000 })
  }

  async openSideTrayRoute(route: string) {
    const parsed = new URL(route, 'https://newframe.invalid')
    const feature = parsed.pathname.slice(1)
    if (feature !== 'send' && feature !== 'trade') this.fail(`Unsupported side tray route: ${route}`)

    const assetId = parsed.searchParams.get('assetId') || undefined
    const chainIdValue = parsed.searchParams.get('chainId')
    const chainId = chainIdValue ? Number(chainIdValue) : undefined
    await this.executeCommand(this.tray, { type: 'sidetray.open', feature, assetId, chainId })
  }

  async getAppState(): Promise<AppState> {
    let lastError: unknown

    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        return await this.app.evaluate(() => {
          const getState = (
            globalThis as typeof globalThis & {
              __NEWFRAME_VISUAL_HARNESS_GET_STATE__?: () => AppState
            }
          ).__NEWFRAME_VISUAL_HARNESS_GET_STATE__

          if (!getState) throw new Error('Visual harness canonical-state getter is unavailable')
          return getState()
        })
      } catch (error) {
        lastError = error
        const message = error instanceof Error ? error.message : String(error)
        if (!message.includes('Execution context was destroyed')) throw error
        await sleep(100)
      }
    }

    throw lastError
  }

  async waitForState(
    predicate: (state: AppState) => boolean,
    timeoutMs: number,
    message: string
  ): Promise<AppState> {
    const started = Date.now()
    let latest: AppState | undefined

    while (Date.now() - started < timeoutMs) {
      latest = await this.getAppState()
      if (predicate(latest)) return latest
      await sleep(250)
    }

    throw new Error(`${message}${latest ? '' : '; state was unavailable'}`)
  }

  currentRequest(state: AppState): CurrentRequest | undefined {
    const crumb = state.windows?.panel?.nav?.[0]
    if (crumb?.view !== 'requestView') return undefined

    const accountId = crumb.data?.accountId || ''
    const requestId = crumb.data?.requestId || ''
    const request = state.main?.accounts?.[accountId]?.requests?.[requestId]
    const handlerId = request?.handlerId || requestId

    return request ? { ...request, accountId, handlerId } : undefined
  }

  async waitForCurrentRequest(type: string, excludeIds = new Set<string>(), timeoutMs = 60_000) {
    const state = await this.waitForState(
      (candidate) => {
        const request = this.currentRequest(candidate)
        if (!request || request.type !== type) return false
        if (excludeIds.has(request.handlerId)) return false
        return !finalRequestStatuses.has(String(request.status || '').toLowerCase())
      },
      timeoutMs,
      `Timed out waiting for current ${type} request`
    )

    const request = this.currentRequest(state)
    if (!request) return this.fail(`Timed out waiting for current ${type} request`)
    return request
  }

  async waitForRequestStatus(handlerId: string, timeoutMs = 15_000) {
    await this.waitForState(
      (state) => {
        const accounts = Object.values(state.main?.accounts || {})
        const request = accounts.map((account) => account.requests?.[handlerId]).find(Boolean)
        if (!request) return true
        const status = String(request.status || '').toLowerCase()
        return Boolean(request.notice || request.tx?.hash || (status && status !== 'pending'))
      },
      timeoutMs,
      `Timed out waiting for request ${handlerId} to submit`
    ).catch(() => undefined)
  }

  findHarnessAccounts(state: AppState): HarnessAccounts {
    const accounts = Object.values(state.main?.accounts || {}) as AccountInfo[]
    const harness = accounts.find((account) => {
      return [account.id, account.address].some(
        (value) => String(value || '').toLowerCase() === harnessAccountAddress
      )
    })
    const vitalik = accounts.find((account) => {
      return [account.ensName, account.name].some(
        (value) => String(value || '').toLowerCase() === 'vitalik.eth'
      )
    })

    if (!harness) this.fail(`Reused profile is missing seeded harness account ${harnessAccountAddress}`)
    if (!vitalik) this.fail('Reused profile is missing an account displayed as vitalik.eth')

    return {
      harness: {
        ...harness,
        id: String(harness.id || harness.address).toLowerCase(),
        address: String(harness.address || harness.id).toLowerCase()
      },
      vitalik: {
        ...vitalik,
        id: String(vitalik.id || vitalik.address).toLowerCase(),
        address: String(vitalik.address || vitalik.id).toLowerCase()
      }
    }
  }

  async selectAccount(account: AccountInfo, searchValue: string, screenshotName?: string) {
    await this.tray.getByRole('button', { name: 'Accounts' }).click()
    const dialog = this.tray.getByRole('dialog', { name: 'Accounts' })
    await dialog.waitFor({ state: 'visible' })
    await dialog.getByRole('textbox', { name: 'Search accounts' }).fill(searchValue)
    await dialog.locator('.t2AccountRow').first().waitFor({ state: 'visible', timeout: 10_000 })

    if (screenshotName) await this.screenshot(this.tray, screenshotName)

    const displayName = account.ensName || account.name || ''
    const shortAddress = `${account.address.slice(0, 5)}…${account.address.slice(-4)}`
    const escapedName = (displayName || shortAddress).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const row = dialog.getByRole('button', { name: new RegExp(escapedName, 'i') }).first()

    if ((await row.count()) > 0) {
      await row.click()
    } else {
      // TODO: replace this with a stronger app-level accessible label if account rows stop exposing row text.
      await dialog.locator('.t2AccountRow').first().click()
    }

    await dialog.waitFor({ state: 'hidden', timeout: 10_000 })
    await this.waitForSelectedAccount(account)
  }

  async selectNetwork(name: string) {
    const dialog = this.tray.getByRole('dialog', { name: 'Networks' })

    if (!(await dialog.isVisible({ timeout: 500 }).catch(() => false))) {
      await this.tray.getByRole('button', { name: 'Network filter' }).click()
      await dialog.waitFor({ state: 'visible' })
    }

    await dialog.getByRole('textbox', { name: 'Search networks' }).fill(name)
    await dialog.getByRole('button', { name, exact: true }).click()
    await dialog.waitFor({ state: 'hidden', timeout: 10_000 })
  }

  async waitForSelectedAccount(account: AccountInfo, timeoutMs = 5_000) {
    await this.waitForState(
      (state) => String(state.main?.currentAccount || '').toLowerCase() === account.id.toLowerCase(),
      timeoutMs,
      `Expected selected account to be ${account.id}`
    )
  }

  async setSelectedAccount(account: AccountInfo) {
    const selected = String((await this.getAppState()).main?.currentAccount || '').toLowerCase()
    if (selected !== account.id.toLowerCase()) {
      await this.executeCommand(this.tray, { type: 'account.select', accountId: account.id })
    }
    await this.waitForSelectedAccount(account)
  }

  nativeAnvilBalance(state: AppState, address: string) {
    const balances = state.main?.balances?.[address.toLowerCase()] || []
    return balances.find((balance) => {
      return (
        Number(balance.chainId) === anvilChainId &&
        String(balance.address || '').toLowerCase() === nativeCurrencyAddress
      )
    })
  }

  async setNativeAnvilBalance(account: AccountInfo) {
    await this.setSelectedAccount(account)
    await this.refreshBalances()
    await this.waitForState(
      (state) => Boolean(this.nativeAnvilBalance(state, account.address)),
      10_000,
      'Anvil ETH did not synchronize after the portfolio refresh command'
    )
  }

  async refreshBalances() {
    await this.executeCommand(this.tray, { type: 'portfolio.refresh' })
  }

  async maybeProceedWarning(filename: string) {
    const proceed = this.tray.getByText('Proceed', { exact: true }).last()
    if (!(await proceed.isVisible({ timeout: 750 }).catch(() => false))) return false

    await this.screenshot(this.tray, filename)
    await proceed.click()
    await sleep(500)
    return true
  }

  async signCurrentTransaction(
    request: CurrentRequest,
    submittedScreenshot: string,
    warningScreenshots: string[]
  ) {
    if (warningScreenshots[0]) await this.maybeProceedWarning(warningScreenshots[0])

    // The visible Sign button has an intentional UI delay; approve after the harness captures the review.
    await this.executeCommand(this.tray, { type: 'request.approve', requestId: request.handlerId })
    void this.anvil.mineBlocksOver(10, 150).catch(() => undefined)

    if (warningScreenshots[1]) await this.maybeProceedWarning(warningScreenshots[1])
    await this.waitForRequestStatus(request.handlerId)
    await this.screenshot(this.tray, submittedScreenshot)
  }

  async signCurrentSignature(request: CurrentRequest, submittedScreenshot: string) {
    await this.executeCommand(this.tray, { type: 'request.approve', requestId: request.handlerId })
    await this.waitForRequestStatus(request.handlerId)
    await this.screenshot(this.tray, submittedScreenshot)
  }

  async clearPanelAndOverlays() {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const accountBack = this.tray.locator('.accountViewBack').first()
      if (!(await accountBack.isVisible({ timeout: 250 }).catch(() => false))) break
      await accountBack.click()
      await sleep(150)
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const backToPositions = this.tray.getByRole('button', { name: 'Back to positions' })
      if (!(await backToPositions.isVisible({ timeout: 500 }).catch(() => false))) break
      await backToPositions.click()
      await sleep(300)
    }

    const positionsTab = this.tray.getByRole('tab', { name: 'Positions', exact: true })
    if (
      (await positionsTab.isVisible({ timeout: 500 }).catch(() => false)) &&
      (await positionsTab.getAttribute('aria-selected')) !== 'true'
    ) {
      await positionsTab.click()
    }
  }

  async openTradeTicket() {
    await this.openSideTrayRoute(
      this.sideTrayRoute('trade', this.canonicalAssetId(anvilChainId, wethAddress))
    )
    const tradePage = await this.waitForElectronPage('bundle/sidetray.html')
    await this.waitForSideTrayRoute(tradePage, 'trade')
    await tradePage.getByRole('tab', { name: 'Market' }).waitFor({ state: 'visible', timeout: 15_000 })
    return tradePage
  }

  async openDefaultTradeTicket() {
    await this.clearPanelAndOverlays()
    const tradeButton = this.tray.getByRole('button', { name: 'Trade', exact: true })
    await tradeButton.waitFor({ state: 'visible', timeout: 5_000 })
    await tradeButton.click()
    const tradePage = await this.waitForElectronPage('bundle/sidetray.html')
    await this.waitForSideTrayRoute(tradePage, 'trade')
    await tradePage.getByRole('tab', { name: 'Market' }).waitFor({ state: 'visible', timeout: 15_000 })
    return tradePage
  }

  async assertTradeTicketVisualControls(page: Page) {
    if ((await page.getByRole('group', { name: 'Trade direction' }).count()) > 0) {
      this.fail('Trade ticket still exposes the old explicit BUY/SELL segmented control')
    }

    await page.getByRole('button', { name: /Switch to (BUY|SELL)/ }).waitFor({
      state: 'visible',
      timeout: 5_000
    })
    await page.getByRole('button', { name: /Select target asset/i }).waitFor({
      state: 'visible',
      timeout: 5_000
    })
    await page.getByRole('button', { name: /Select contra asset/i }).waitFor({
      state: 'visible',
      timeout: 5_000
    })
    await page.getByLabel(/amount percentage$/).waitFor({
      state: 'visible',
      timeout: 5_000
    })

    for (const tab of ['Market', 'Limit', 'TWAP', 'TP/SL', 'Stop']) {
      await page.getByRole('tab', { name: tab, exact: true }).waitFor({
        state: 'visible',
        timeout: 5_000
      })
    }
  }

  async assertTradeBalanceDirectionColor(page: Page) {
    const colors = await page.evaluate(() => {
      const slider = document.querySelector<HTMLInputElement>(
        'input[type="range"][aria-label$=" amount percentage"]'
      )
      const tone = slider?.dataset.tone || ''
      const side = tone === 'special' ? 'buy' : tone === 'danger' ? 'sell' : ''
      const intentLabel = side === 'buy' ? 'BUY' : side === 'sell' ? 'SELL' : ''
      const intent = Array.from(document.querySelectorAll<HTMLElement>('[data-tone]')).find(
        (element) => element.textContent?.trim() === intentLabel
      )

      return {
        accent: slider ? getComputedStyle(slider).getPropertyValue('accent-color') : '',
        intent: intent ? getComputedStyle(intent).color : '',
        side
      }
    })

    if (!colors.side) this.fail('Trade balance slider is missing its direction state')
    if (!colors.accent || colors.accent !== colors.intent) {
      this.fail(
        `Trade ${colors.side} balance slider color (${colors.accent || 'missing'}) does not match its intent (${colors.intent || 'missing'})`
      )
    }
  }

  async waitForFlashOrder(predicate: (order: FlashOrder) => boolean, timeoutMs: number, message: string) {
    const state = await this.waitForState(
      (candidate) => Object.values(candidate.main?.orders || {}).some(predicate),
      timeoutMs,
      message
    )
    return Object.values(state.main?.orders || {}).find(predicate) as FlashOrder
  }

  async assertFlashOrderVisible(orderId: string) {
    const ordersTab = this.tray.getByRole('tab', { name: 'Orders', exact: true })
    await ordersTab.waitFor({ state: 'visible', timeout: 10_000 })
    await ordersTab.click()
    await this.tray.locator(`[data-order-id="${orderId}"]`).waitFor({ state: 'visible', timeout: 10_000 })
  }

  async ensureTradeSellSide(tradePage: Page) {
    const switchToSell = tradePage.getByRole('button', { name: /Switch to SELL/i })
    if (await switchToSell.isVisible({ timeout: 1_000 }).catch(() => false)) await switchToSell.click()
    await tradePage.getByLabel('WETH amount', { exact: true }).waitFor({ state: 'visible', timeout: 5_000 })
  }
}
