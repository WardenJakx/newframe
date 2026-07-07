import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createRequire } from 'node:module'
import net from 'node:net'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import { chromium, type Browser, type CDPSession, type Page } from 'playwright-core'

const rootDir = path.resolve(import.meta.dirname, '../..')
const appDir = path.join(rootDir, 'apps/newframe')
const contractsDir = path.join(rootDir, 'newframe-contracts')
const outputDir = '/tmp/newframe-visual-harness'
const screenshotDir = path.join(outputDir, 'screenshots')

const anvilPort = 8545
const newframeRpcPort = 1248
const cdpPort = 9333
const anvilRpcUrl = `http://127.0.0.1:${anvilPort}`
const harnessOrigin = 'newframe-contracts.local'
const harnessAccountAddress = '0x35f9179059a691d8beecf82fe112f7277e018588'
const dappLauncherFrameId = 'dappLauncher'
const nativeCurrencyAddress = '0x0000000000000000000000000000000000000000'
const wethAddress = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
const anvilChainId = 31337
const oneEthWei = 1_000_000_000_000_000_000n

const passwordEnvKeys = ['NEWFRAME_HARNESS_PASSWORD', 'FRAME_HARNESS_PASSWORD']
const passwordEnvFiles = ['.env.harness.local', '.env.harness', '.env.local', '.env']
const finalRequestStatuses = new Set(['confirmed', 'declined', 'error', 'success'])

type HarnessSummary = {
  ok: boolean
  failedStage: string | null
  screenshots: string[]
}

type AccountInfo = {
  id: string
  address: string
  name?: string
  ensName?: string
}

type RunningCommand = {
  child: ChildProcessWithoutNullStreams
  label: string
  output: () => string
  promise: Promise<void>
}

type AppBalance = {
  address?: string
  chainId?: number | string
  [key: string]: unknown
}

type AppNetwork = {
  name?: string
  [key: string]: unknown
}

type AppOrigin = {
  name?: string
  [key: string]: unknown
}

type AppPermission = {
  handlerId?: string
  origin?: string
  [key: string]: unknown
}

type AddChain = {
  explorer?: unknown
  [key: string]: unknown
}

type AppRequest = {
  chain?: AddChain
  handlerId?: string
  notice?: unknown
  status?: string
  tx?: { hash?: string }
  type?: string
  [key: string]: unknown
}

type CurrentRequest = AppRequest & {
  accountId: string
  handlerId: string
}

type AppAccount = AccountInfo & {
  requests?: Record<string, AppRequest>
}

type AppState = {
  main?: {
    accounts?: Record<string, AppAccount>
    accountOrder?: string[]
    balances?: Record<string, AppBalance[]>
    networks?: { ethereum?: Record<string, AppNetwork> }
    origins?: Record<string, AppOrigin>
    permissions?: Record<string, Record<string, AppPermission>>
    showTestnets?: boolean
  }
  selected?: { current?: string }
  windows?: {
    panel?: {
      nav?: Array<{
        view?: string
        data?: {
          accountId?: string
          requestId?: string
        }
      }>
    }
  }
}

type RuntimeEvaluateResponse<T> = {
  result?: {
    value?: T
    description?: string
  }
  exceptionDetails?: {
    text?: string
    exception?: {
      description?: string
    }
  }
}

let stage = 'startup'
const summary: HarnessSummary = { ok: false, failedStage: null, screenshots: [] }
let browser: Browser | undefined
let electronProcess: ChildProcessWithoutNullStreams | undefined
let anvilProcess: ChildProcessWithoutNullStreams | undefined
const runningCommands = new Set<RunningCommand>()
const pageSessions = new WeakMap<Page, Promise<CDPSession>>()
let cleanupStarted = false

function log(message: string) {
  console.log(`[visual-harness] ${message}`)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function writeSummary() {
  await fsp.mkdir(outputDir, { recursive: true })
  await fsp.writeFile(path.join(outputDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`)
}

function fail(message: string): never {
  throw new Error(`[${stage}] ${message}`)
}

function tail(value: string, maxLength = 8_000) {
  return value.length > maxLength ? value.slice(value.length - maxLength) : value
}

async function withStage<T>(name: string, fn: () => Promise<T>): Promise<T> {
  stage = name
  log(name)
  return fn()
}

function parseEnvValue(value: string) {
  const trimmed = value.trim()
  const quote = trimmed[0]

  if ((quote === '"' || quote === "'") && trimmed.endsWith(quote)) {
    return trimmed.slice(1, -1)
  }

  return trimmed
}

function readEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return {}

  return fs
    .readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .reduce<Record<string, string>>((env, rawLine) => {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) return env

      const normalizedLine = line.startsWith('export ') ? line.slice('export '.length).trim() : line
      const separator = normalizedLine.indexOf('=')
      if (separator === -1) return env

      const key = normalizedLine.slice(0, separator).trim()
      if (key) env[key] = parseEnvValue(normalizedLine.slice(separator + 1))

      return env
    }, {})
}

function readHarnessPassword() {
  for (const key of passwordEnvKeys) {
    const value = process.env[key]
    if (value) return value
  }

  for (const baseDir of [rootDir, appDir]) {
    for (const file of passwordEnvFiles) {
      const values = readEnvFile(path.join(baseDir, file))

      for (const key of passwordEnvKeys) {
        const value = values[key]
        if (value) return value
      }
    }
  }

  return ''
}

function newframeEnv() {
  const env = { ...process.env, NODE_ENV: 'production', FRAME_PROFILE: 'dev' }

  for (const key of passwordEnvKeys) {
    delete env[key]
  }

  return env
}

function isPortFree(port: number) {
  return new Promise<boolean>((resolve) => {
    const server = net.createServer()

    server.once('error', () => resolve(false))
    server.once('listening', () => {
      server.close(() => resolve(true))
    })
    server.listen(port, '127.0.0.1')
  })
}

async function assertPortFree(port: number, label: string) {
  if (!(await isPortFree(port))) {
    fail(`${label} port ${port} is already in use`)
  }
}

function commandOutputCollector(child: ChildProcessWithoutNullStreams) {
  let output = ''
  const append = (chunk: Buffer) => {
    output = tail(output + chunk.toString(), 20_000)
  }

  child.stdout.on('data', append)
  child.stderr.on('data', append)

  return () => output
}

function startCommand(label: string, command: string, args: string[], cwd: string): RunningCommand {
  const child = spawn(command, args, {
    cwd,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  const output = commandOutputCollector(child)

  const running: RunningCommand = {
    child,
    label,
    output,
    promise: new Promise<void>((resolve, reject) => {
      child.once('error', (err) => {
        runningCommands.delete(running)
        reject(new Error(`${label} failed to start: ${err.message}`))
      })
      child.once('exit', (code, signal) => {
        runningCommands.delete(running)

        if (code === 0) {
          resolve()
        } else {
          reject(
            new Error(
              `${label} exited with ${signal || `code ${code ?? 'unknown'}`}${
                output() ? `\n\n${tail(output())}` : ''
              }`
            )
          )
        }
      })
    })
  }

  runningCommands.add(running)
  running.promise.catch(() => undefined)
  return running
}

async function runCommand(label: string, command: string, args: string[], cwd: string) {
  const running = startCommand(label, command, args, cwd)
  await running.promise
}

async function ensureCommand(command: string, args = ['--version']) {
  const running = startCommand(`check ${command}`, command, args, rootDir)
  await running.promise.catch((err) => {
    throw new Error(`Required command is missing or not runnable: ${command}\n${err.message}`)
  })
}

async function stopProcess(child: ChildProcessWithoutNullStreams | undefined, label: string) {
  if (!child || child.killed || child.exitCode !== null) return

  child.kill('SIGTERM')

  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    sleep(5_000).then(() => {
      if (child.exitCode === null) child.kill('SIGKILL')
    })
  ])

  log(`stopped ${label}`)
}

async function cleanup() {
  if (cleanupStarted) return
  cleanupStarted = true

  for (const running of Array.from(runningCommands)) {
    await stopProcess(running.child, running.label).catch(() => undefined)
  }

  if (browser) {
    await browser.close().catch(() => undefined)
    browser = undefined
  }

  await stopProcess(electronProcess, 'electron').catch(() => undefined)
  electronProcess = undefined

  await stopProcess(anvilProcess, 'anvil').catch(() => undefined)
  anvilProcess = undefined
  await writeSummary().catch(() => undefined)
}

async function screenshot(page: Page, filename: string) {
  await fsp.mkdir(screenshotDir, { recursive: true })
  await page.bringToFront().catch(() => undefined)
  await page.screenshot({ path: path.join(screenshotDir, filename) })
  summary.screenshots.push(filename)
  await writeSummary()
}

function browserPages(app: Browser) {
  return app.contexts().flatMap((context) => context.pages())
}

async function waitForElectronPage(app: Browser, urlPart: string, timeoutMs = 30_000) {
  const started = Date.now()
  let lastLog = 0

  while (Date.now() - started < timeoutMs) {
    const page = browserPages(app).find((candidate) => candidate.url().includes(urlPart))
    if (page) return page

    if (Date.now() - lastLog > 2_500) {
      lastLog = Date.now()
      const urls = browserPages(app).map((candidate) => candidate.url() || '<blank>')
      log(`waiting for ${urlPart}; pages: ${urls.join(', ') || '<none>'}`)
    }

    await sleep(250)
  }

  fail(`Timed out waiting for Electron page containing ${urlPart}`)
}

function literal(value: unknown) {
  return JSON.stringify(value) ?? 'undefined'
}

function canonicalAssetId(chainId: number, address: string) {
  return `${chainId}:${address.toLowerCase()}`
}

function launcherRoute(route: 'send' | 'trade', assetId = '') {
  return assetId ? `/${route}?assetId=${encodeURIComponent(assetId)}` : `/${route}`
}

async function waitForDappRoute(page: Page, route: 'send' | 'trade') {
  await page.waitForURL((url) => url.hash.startsWith(`#/${route}`), { timeout: 15_000 })
}

async function cdpSession(page: Page) {
  let session = pageSessions.get(page)

  if (!session) {
    session = page.context().newCDPSession(page)
    pageSessions.set(page, session)
  }

  return session
}

async function cdpEvaluate<T>(page: Page, expression: string) {
  const session = await cdpSession(page)
  const response = (await session.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  })) as RuntimeEvaluateResponse<T>

  if (response.exceptionDetails) {
    throw new Error(
      response.exceptionDetails.exception?.description ||
        response.exceptionDetails.text ||
        response.result?.description ||
        'CDP Runtime.evaluate failed'
    )
  }

  return response.result?.value as T
}

async function linkRpc<T>(page: Page, method: string, ...args: unknown[]): Promise<T> {
  const response = await cdpEvaluate<unknown>(
    page,
    `
      (async () => {
        const rpcMethod = ${literal(method)}
        const rpcArgs = ${literal(args)}
        const host = window.__NEWFRAME_HOST__

        if (!host) throw new Error('Newframe host bridge is not available')
        return host.rpc(rpcMethod, rpcArgs)
      })()
    `
  )

  if (Array.isArray(response)) {
    const [err, value] = response as [unknown, T]
    if (err) throw new Error(typeof err === 'string' ? err : JSON.stringify(err))
    return value
  }

  return response as T
}

async function linkRpcNoWait(page: Page, method: string, ...args: unknown[]) {
  await cdpEvaluate(
    page,
    `
      (() => {
        const rpcMethod = ${literal(method)}
        const rpcArgs = ${literal(args)}
        const host = window.__NEWFRAME_HOST__

        if (!host) throw new Error('Newframe host bridge is not available')

        const response = host.rpc(rpcMethod, rpcArgs)
        if (response && typeof response.catch === 'function') response.catch(() => undefined)

        return true
      })()
    `
  )
}

async function linkSend(page: Page, channel: string, ...args: unknown[]) {
  await cdpEvaluate(
    page,
    `
      (() => {
        const channel = ${literal(channel)}
        const args = ${literal(args)}
        const host = window.__NEWFRAME_HOST__

        if (!host) throw new Error('Newframe host bridge is not available')
        host.send(channel, args)
        return true
      })()
    `
  )
}

async function linkInvoke<T>(page: Page, channel: string, ...args: unknown[]): Promise<T> {
  const response = await cdpEvaluate<unknown>(
    page,
    `
      (async () => {
        const invokeChannel = ${literal(channel)}
        const invokeArgs = ${literal(args)}
        const host = window.__NEWFRAME_HOST__

        if (!host) throw new Error('Newframe host bridge is not available')
        return host.invoke(invokeChannel, invokeArgs)
      })()
    `
  )

  return Array.isArray(response) ? (response as [T])[0] : (response as T)
}

async function trayAction(page: Page, action: string, ...args: unknown[]) {
  await linkSend(page, 'tray:action', action, ...args)
  await sleep(100)
}

async function openDappLauncherRoute(tray: Page, route: string) {
  await linkSend(tray, '*:addFrame', {
    id: dappLauncherFrameId,
    route
  })
  await trayAction(tray, 'setDash', { showing: false })
}

async function getAppState(page: Page) {
  return linkRpc<AppState>(page, 'getState')
}

async function waitForState(
  page: Page,
  predicate: (state: AppState) => boolean,
  timeoutMs: number,
  message: string
) {
  const started = Date.now()
  let latest: AppState | undefined

  while (Date.now() - started < timeoutMs) {
    latest = await getAppState(page)
    if (predicate(latest)) return latest
    await sleep(250)
  }

  throw new Error(`${message}${latest ? '' : '; state was unavailable'}`)
}

function currentRequest(state: AppState): CurrentRequest | undefined {
  const crumb = state.windows?.panel?.nav?.[0]
  if (crumb?.view !== 'requestView') return undefined

  const accountId = crumb.data?.accountId || ''
  const requestId = crumb.data?.requestId || ''
  const request = state.main?.accounts?.[accountId]?.requests?.[requestId]
  const handlerId = request?.handlerId || requestId

  return request ? { ...request, accountId, handlerId } : undefined
}

async function waitForCurrentRequest(
  page: Page,
  type: string,
  excludeIds = new Set<string>(),
  timeoutMs = 60_000
) {
  const state = await waitForState(
    page,
    (candidate) => {
      const request = currentRequest(candidate)
      if (!request || request.type !== type) return false
      if (excludeIds.has(request.handlerId)) return false
      return !finalRequestStatuses.has(String(request.status || '').toLowerCase())
    },
    timeoutMs,
    `Timed out waiting for current ${type} request`
  )

  const request = currentRequest(state)
  if (!request) fail(`Timed out waiting for current ${type} request`)
  return request
}

async function waitForRequestStatus(page: Page, handlerId: string, timeoutMs = 15_000) {
  await waitForState(
    page,
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

function accountShort(address: string) {
  return `${address.slice(0, 5)}…${address.slice(-4)}`
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function accountsFromState(state: AppState) {
  return Object.values(state.main?.accounts || {}) as AccountInfo[]
}

function findHarnessAccounts(state: AppState) {
  const accounts = accountsFromState(state)
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

  if (!harness) fail(`Reused profile is missing seeded harness account ${harnessAccountAddress}`)
  if (!vitalik) fail('Reused profile is missing an account displayed as vitalik.eth')

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

async function selectAccount(page: Page, account: AccountInfo, searchValue: string, screenshotName?: string) {
  await page.getByRole('button', { name: 'Accounts' }).click()
  const dialog = page.getByRole('dialog', { name: 'Accounts' })
  await dialog.waitFor({ state: 'visible' })

  await dialog.getByRole('textbox', { name: 'Search accounts' }).fill(searchValue)
  await dialog.locator('.t2AccountRow').first().waitFor({ state: 'visible', timeout: 10_000 })

  if (screenshotName) await screenshot(page, screenshotName)

  const displayName = account.ensName || account.name || ''
  const accessibleName = displayName
    ? new RegExp(escapeRegex(displayName), 'i')
    : new RegExp(escapeRegex(accountShort(account.address)), 'i')
  const row = dialog.getByRole('button', { name: accessibleName }).first()

  if ((await row.count()) > 0) {
    await row.click()
  } else {
    // TODO: replace this with a stronger app-level accessible label if account rows stop exposing the visible row text.
    await dialog.locator('.t2AccountRow').first().click()
  }

  await dialog.waitFor({ state: 'hidden', timeout: 10_000 })
  await waitForSelectedAccount(page, account)
}

async function selectNetwork(page: Page, name: string) {
  const dialog = page.getByRole('dialog', { name: 'Networks' })

  if (!(await dialog.isVisible({ timeout: 500 }).catch(() => false))) {
    await page.getByRole('button', { name: 'Network filter' }).click()
    await dialog.waitFor({ state: 'visible' })
  }

  await dialog.getByRole('textbox', { name: 'Search networks' }).fill(name)
  await dialog.getByRole('button', { name, exact: true }).click()
  await dialog.waitFor({ state: 'hidden', timeout: 10_000 })
}

async function waitForSelectedAccount(page: Page, account: AccountInfo, timeoutMs = 5_000) {
  await waitForState(
    page,
    (state) => String(state.selected?.current || '').toLowerCase() === account.id.toLowerCase(),
    timeoutMs,
    `Expected selected account to be ${account.id}`
  )
}

async function setSelectedAccount(page: Page, account: AccountInfo) {
  const selected = String((await getAppState(page)).selected?.current || '').toLowerCase()
  if (selected !== account.id.toLowerCase()) {
    await linkRpc(page, 'setSigner', account.id)
  }

  await waitForSelectedAccount(page, account)
}

function nativeAnvilBalance(state: AppState, address: string) {
  const balances = state.main?.balances?.[address.toLowerCase()] || []
  return balances.find((balance) => {
    return (
      Number(balance.chainId) === anvilChainId &&
      String(balance.address || '').toLowerCase() === nativeCurrencyAddress
    )
  })
}

function formatUnits(value: bigint, decimals: bigint) {
  const scale = 10n ** decimals
  const whole = value / scale
  const fraction = value % scale

  if (fraction === 0n) return `${whole}.0`

  const paddedFraction = fraction.toString().padStart(Number(decimals), '0').replace(/0+$/, '')
  return `${whole}.${paddedFraction}`
}

async function setNativeAnvilBalance(page: Page, account: AccountInfo) {
  const balance = await anvilBalance(account.address)

  await trayAction(page, 'setBalance', account.address, {
    address: nativeCurrencyAddress,
    balance: `0x${balance.toString(16)}`,
    chainId: anvilChainId,
    displayBalance: formatUnits(balance, 18n),
    symbol: 'ETH'
  })
}

function normalizeAddChain(chain: AddChain) {
  return {
    ...chain,
    explorer: typeof chain?.explorer === 'string' ? chain.explorer : ''
  }
}

async function refreshBalances(page: Page, account: AccountInfo) {
  await linkInvoke(page, 'tray:refreshPortfolioBalances', account.id).catch(() => undefined)
}

async function anvilBalance(address: string) {
  const response = await fetch(anvilRpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: 1,
      jsonrpc: '2.0',
      method: 'eth_getBalance',
      params: [address, 'latest']
    })
  })
  const payload = (await response.json()) as { result?: string; error?: { message?: string } }

  if (!response.ok || payload.error || !payload.result) {
    throw new Error(payload.error?.message || `Anvil balance request failed with ${response.status}`)
  }

  return BigInt(payload.result)
}

async function mineAnvilBlocks(count: number) {
  for (let i = 0; i < count; i += 1) {
    const response = await fetch(anvilRpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: i + 1,
        jsonrpc: '2.0',
        method: 'evm_mine',
        params: []
      })
    })
    const payload = (await response.json()) as { error?: { message?: string } }

    if (!response.ok || payload.error) {
      throw new Error(payload.error?.message || `Anvil mine request failed with ${response.status}`)
    }
  }
}

async function mineAnvilBlocksOver(count: number, delayMs: number) {
  for (let i = 0; i < count; i += 1) {
    await sleep(delayMs)
    await mineAnvilBlocks(1)
  }
}

function startBackgroundMining(intervalMs: number) {
  let stopped = false
  const promise = (async () => {
    while (!stopped) {
      await sleep(intervalMs)
      if (!stopped) await mineAnvilBlocks(1).catch(() => undefined)
    }
  })()

  return async () => {
    stopped = true
    await promise
  }
}

async function waitForAnvilBalance(address: string, expected: bigint) {
  const started = Date.now()

  while (Date.now() - started < 45_000) {
    const current = await anvilBalance(address)
    if (current === expected) return
    await sleep(500)
  }

  const current = await anvilBalance(address)
  throw new Error(`Expected ${address} balance ${expected}, found ${current}`)
}

async function maybeProceedWarning(page: Page, filename: string) {
  const proceed = page.getByText('Proceed', { exact: true }).last()

  if (!(await proceed.isVisible({ timeout: 750 }).catch(() => false))) return false

  await screenshot(page, filename)
  await proceed.click()
  await sleep(500)
  return true
}

async function signCurrentTransaction(
  page: Page,
  request: CurrentRequest,
  submittedScreenshot: string,
  warningScreenshots: string[]
) {
  if (warningScreenshots[0]) {
    await maybeProceedWarning(page, warningScreenshots[0])
  }

  // TODO: the visible Sign button has an intentional UI delay; approve via the same app RPC after screenshotting the review.
  await linkRpcNoWait(page, 'approveRequest', request)
  mineAnvilBlocksOver(10, 150).catch(() => undefined)

  if (warningScreenshots[1]) {
    await maybeProceedWarning(page, warningScreenshots[1])
  }

  await waitForRequestStatus(page, request.handlerId)
  await screenshot(page, submittedScreenshot)
}

async function clearPanelAndOverlays(page: Page) {
  await trayAction(page, 'navBack', 'panel', 99)

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const backToPositions = page.getByRole('button', { name: 'Back to positions' })

    if (!(await backToPositions.isVisible({ timeout: 500 }).catch(() => false))) break

    await backToPositions.click()
    await sleep(300)
  }
}

async function openTradeTicket(app: Browser, tray: Page) {
  await openDappLauncherRoute(tray, launcherRoute('trade', canonicalAssetId(anvilChainId, wethAddress)))

  const tradePage = await waitForElectronPage(app, 'bundle/dapp.html')
  await waitForDappRoute(tradePage, 'trade')
  await tradePage.getByRole('tab', { name: 'Market' }).waitFor({ state: 'visible', timeout: 15_000 })

  return tradePage
}

async function assertTradeTicketVisualControls(page: Page) {
  const staleDirectionGroup = page.getByRole('group', { name: 'Trade direction' })

  if ((await staleDirectionGroup.count()) > 0) {
    fail('Trade ticket still exposes the old explicit BUY/SELL segmented control')
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
}

async function screenshotTradeTicketVisualStates(app: Browser, tray: Page) {
  const tradePage = await openTradeTicket(app, tray)
  await assertTradeTicketVisualControls(tradePage)
  await screenshot(tradePage, '10a-trade-market-open.png')

  await tradePage.getByRole('button', { name: /Switch to (BUY|SELL)/ }).click()
  await tradePage.getByRole('button', { name: /Switch to (BUY|SELL)/ }).waitFor({
    state: 'visible',
    timeout: 5_000
  })
  await screenshot(tradePage, '10b-trade-direction-switched.png')

  await tradePage.getByRole('button', { name: /Select target asset/i }).click()
  await tradePage
    .getByRole('button', { name: /Choose target asset/i })
    .first()
    .waitFor({
      state: 'visible',
      timeout: 5_000
    })
  await screenshot(tradePage, '10c-trade-target-asset-menu.png')

  await tradePage.getByRole('button', { name: /Select target asset/i }).click()
  await tradePage.getByRole('button', { name: /Select contra asset/i }).click()
  await tradePage.getByRole('button', { name: /Choose contra asset ETH Ether 0xeeeee/i }).waitFor({
    state: 'visible',
    timeout: 5_000
  })
  await screenshot(tradePage, '10d-trade-contra-asset-menu.png')

  await tradePage.getByRole('button', { name: /Select contra asset/i }).click()
  await tradePage.getByRole('tab', { name: 'Limit' }).click()

  const limitOrderType = tradePage.getByLabel('Limit order type')
  await limitOrderType.waitFor({ state: 'visible', timeout: 5_000 })

  const box = await limitOrderType.boundingBox()
  if (!box || box.width < 300) fail('Limit order type selector is not rendering as a full-width row')

  await screenshot(tradePage, '10e-trade-limit-order-type-row.png')

  await openDappLauncherRoute(tray, launcherRoute('send'))
  await waitForDappRoute(tradePage, 'send')
  await tradePage.getByRole('textbox', { name: 'Recipient' }).waitFor({ state: 'visible', timeout: 15_000 })

  const resetSendAmount = await tradePage.getByRole('textbox', { name: 'Amount' }).inputValue()
  if (resetSendAmount !== '1') fail(`Send relaunch did not reset amount; found "${resetSendAmount}"`)

  await screenshot(tradePage, '10f-relaunch-send-reset.png')

  await openDappLauncherRoute(tray, launcherRoute('trade', canonicalAssetId(anvilChainId, wethAddress)))
  await waitForDappRoute(tradePage, 'trade')
  await tradePage.getByRole('tab', { name: 'Market' }).waitFor({ state: 'visible', timeout: 15_000 })
  await assertTradeTicketVisualControls(tradePage)
  await screenshot(tradePage, '10g-relaunch-trade-reset.png')

  await tradePage
    .getByRole('button', { name: 'Close Trade' })
    .click()
    .catch(() => undefined)
}

async function bootstrap() {
  await withStage('preflight', async () => {
    await fsp.mkdir(screenshotDir, { recursive: true })
    await writeSummary()
    createRequire(path.join(appDir, 'package.json'))('electron')

    await Promise.all([
      ensureCommand('bun'),
      ensureCommand('make'),
      ensureCommand('anvil'),
      ensureCommand('cast'),
      ensureCommand('forge'),
      assertPortFree(anvilPort, 'Anvil'),
      assertPortFree(cdpPort, 'Electron CDP'),
      assertPortFree(newframeRpcPort, 'Newframe RPC')
    ])
  })

  await withStage('bootstrap build and anvil', async () => {
    anvilProcess = spawn(
      'anvil',
      ['--host', '127.0.0.1', '--port', String(anvilPort), '--chain-id', String(anvilChainId)],
      {
        cwd: contractsDir,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe']
      }
    )
    commandOutputCollector(anvilProcess)

    const seed = runCommand('contracts seed', 'make', ['seed'], contractsDir)
    const build = (async () => {
      await runCommand('newframe compile', 'bun', ['run', 'compile'], appDir)
      await runCommand('newframe bundle', 'bun', ['run', 'bundle'], appDir)
    })()

    await Promise.all([seed, build])
  })
}

async function connectOverCdp(timeoutMs = 30_000) {
  const endpoint = `http://127.0.0.1:${cdpPort}`
  const started = Date.now()
  let lastError: unknown

  while (Date.now() - started < timeoutMs) {
    try {
      return await chromium.connectOverCDP(endpoint, { noDefaults: true, timeout: 1_000 })
    } catch (err) {
      lastError = err
      await sleep(250)
    }
  }

  throw new Error(
    `Timed out connecting to Electron CDP at ${endpoint}${
      lastError instanceof Error ? `\n${lastError.message}` : ''
    }`
  )
}

async function launchApp() {
  return withStage('launch electron', async () => {
    const requireFromApp = createRequire(path.join(appDir, 'package.json'))
    const electronPath = requireFromApp('electron') as string

    electronProcess = spawn(electronPath, [`--remote-debugging-port=${cdpPort}`, './compiled/main'], {
      cwd: appDir,
      env: newframeEnv(),
      stdio: ['ignore', 'pipe', 'pipe']
    })
    const output = commandOutputCollector(electronProcess)
    const exitPromise = new Promise<never>((_, reject) => {
      electronProcess?.once('error', (err) => {
        reject(new Error(`Electron failed to start: ${err.message}`))
      })
      electronProcess?.once('exit', (code, signal) => {
        reject(
          new Error(
            `Electron exited before CDP attach with ${signal || `code ${code ?? 'unknown'}`}${
              output() ? `\n\n${tail(output())}` : ''
            }`
          )
        )
      })
    })

    const app = await Promise.race([connectOverCdp(), exitPromise])
    browser = app
    log(`connected to Electron CDP on ${cdpPort}`)
    return app
  })
}

async function forceLockAndUnlock(tray: Page) {
  await withStage('lock screen', async () => {
    const unlockDialog = tray.getByRole('dialog', { name: 'Unlock Newframe' })

    if (!(await unlockDialog.isVisible({ timeout: 2_000 }).catch(() => false))) {
      await linkRpc(tray, 'lockVault')
      await unlockDialog.waitFor({ state: 'visible', timeout: 15_000 })
    }

    await screenshot(tray, '01-lock-screen.png')
  })

  await withStage('unlock', async () => {
    const password = readHarnessPassword()
    if (!password) fail('Newframe unlock password is not configured')

    const dialog = tray.getByRole('dialog', { name: 'Unlock Newframe' })
    await dialog.getByRole('textbox', { name: 'Newframe password' }).fill(password)
    await dialog.getByRole('button', { name: 'Unlock' }).click()
    await tray.getByRole('button', { name: 'Main menu' }).waitFor({ state: 'visible', timeout: 20_000 })
  })
}

async function resetHarnessState(tray: Page) {
  await withStage('reset harness-owned state', async () => {
    const state = await getAppState(tray)
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
      await linkSend(tray, 'tray:removeOrigin', originId)
    }

    await trayAction(tray, 'removeNetwork', { type: 'ethereum', id: anvilChainId })
    await trayAction(tray, 'setShowTestnets', true)

    await waitForState(
      tray,
      (candidate) => {
        const networks = candidate.main?.networks?.ethereum || {}
        return candidate.main?.showTestnets === true && !networks[String(anvilChainId)]
      },
      5_000,
      'Harness-owned state did not reset'
    )
  })
}

async function runFlow(app: Browser) {
  const tray = await waitForElectronPage(app, 'bundle/tray.html')
  const consoleErrors: string[] = []

  tray.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })

  await forceLockAndUnlock(tray)
  await resetHarnessState(tray)
  await screenshot(tray, '02-unlocked-home.png')

  const { harness, vitalik } = findHarnessAccounts(await getAppState(tray))

  await withStage('vitalik positions', async () => {
    await selectAccount(tray, vitalik, 'vitalik.eth', '03-accounts-panel-vitalik-search.png')
    await tray.getByRole('tab', { name: 'Positions' }).click()
    await screenshot(tray, '04-vitalik-positions.png')
  })

  await withStage('select harness account', async () => {
    await selectAccount(tray, harness, harness.address)
    await tray.getByRole('tab', { name: 'Positions' }).click()
    await screenshot(tray, '05-harness-account-positions.png')
  })

  await withStage('dapp connect and add anvil', async () => {
    const ensureChain = startCommand(
      'contracts ensure-newframe-chain',
      'make',
      ['ensure-newframe-chain'],
      contractsDir
    )

    const accessRequest = await waitForCurrentRequest(tray, 'access', new Set(), 20_000).catch(
      () => undefined
    )
    if (accessRequest) {
      await screenshot(tray, '06-dapp-connect-request.png')
      // TODO: the access footer action is a non-semantic div; use the app bridge until it exposes a stable role/name.
      await linkSend(tray, 'tray:giveAccess', accessRequest, true)
    }

    const addChainRequest = await waitForCurrentRequest(tray, 'addChain', new Set(), 60_000)
    const addChain = normalizeAddChain(addChainRequest.chain)
    await screenshot(tray, '07-add-chain-request-card.png')
    // TODO: the add-chain footer action is a non-semantic div; use the app bridge until it exposes a stable role/name.
    await trayAction(tray, 'navHome', {
      view: 'addChain',
      data: { chain: addChain, request: addChainRequest }
    })
    await tray.getByRole('dialog', { name: 'Add Chain' }).waitFor({ state: 'visible', timeout: 10_000 })
    await screenshot(tray, '08-add-chain-review.png')
    // TODO: the add-chain overlay action is visually present but unreliable under synthetic clicks; use the app bridge.
    await linkSend(tray, 'tray:addChain', addChain, addChainRequest)
    await trayAction(tray, 'navHome', { view: 'networks' })
    await waitForState(
      tray,
      (state) => Boolean(state.main?.networks?.ethereum?.[String(anvilChainId)]),
      10_000,
      'Newframe did not add the local Anvil network'
    )
    await setNativeAnvilBalance(tray, harness)
    refreshBalances(tray, harness).catch(() => undefined)

    await ensureChain.promise
  })

  await withStage('anvil eth positions', async () => {
    await clearPanelAndOverlays(tray)
    await setSelectedAccount(tray, harness)
    await selectNetwork(tray, 'Newframe Local Anvil')
    await tray.getByRole('tab', { name: 'Positions' }).click()
    await waitForState(
      tray,
      (state) => Boolean(nativeAnvilBalance(state, harness.address)),
      5_000,
      'Anvil ETH did not appear for the seeded harness account'
    )
    const ethAssetDetails = tray.getByRole('button', { name: 'ETH asset details' })
    await ethAssetDetails.waitFor({ state: 'visible', timeout: 5_000 }).catch(async (err) => {
      await screenshot(tray, '09-anvil-network-positions.png')
      throw err
    })
    await screenshot(tray, '09-anvil-network-positions.png')
    await ethAssetDetails.click()
    await tray.getByRole('dialog', { name: 'Asset details' }).waitFor({ state: 'visible' })
    await screenshot(tray, '10-eth-asset-details.png')
  })

  await withStage('trade ticket visuals', async () => {
    await screenshotTradeTicketVisualStates(app, tray)
  })

  await withStage('built-in send', async () => {
    await tray.getByRole('button', { name: 'Send ETH' }).click()
    const sendPage = await waitForElectronPage(app, 'bundle/dapp.html')
    await sendPage.getByRole('textbox', { name: 'Recipient' }).waitFor({ state: 'visible', timeout: 15_000 })
    await screenshot(sendPage, '11-send-open.png')
    await sendPage
      .getByRole('button', { name: /vitalik\.eth/i })
      .first()
      .click()
    await screenshot(sendPage, '12-send-recipient-vitalik.png')
    await sendPage.getByRole('textbox', { name: 'Amount' }).fill('1')
    await screenshot(sendPage, '13-send-amount-1-eth.png')

    const vitalikBalanceBefore = await anvilBalance(vitalik.address)
    await sendPage.getByText('Proceed', { exact: true }).click()

    const sendRequest = await waitForCurrentRequest(tray, 'transaction', new Set(), 30_000)
    await screenshot(tray, '14-send-review.png')
    await signCurrentTransaction(tray, sendRequest, '15-send-submitted.png', [
      '14a-send-warning.png',
      '14b-send-post-sign-warning.png'
    ])
    await waitForAnvilBalance(vitalik.address, vitalikBalanceBefore + oneEthWei)
    await clearPanelAndOverlays(tray)
  })

  await withStage('usdc integration', async () => {
    await waitForState(
      tray,
      (state) => String(state.selected?.current || '').toLowerCase() === harness.id,
      5_000,
      'Harness account was not selected before USDC integration'
    )
    const integration = startCommand('contracts integration-usdc', 'make', ['integration-usdc'], contractsDir)
    const stopMining = startBackgroundMining(100)

    try {
      const firstRequest = await waitForCurrentRequest(tray, 'transaction', new Set(), 60_000)
      await screenshot(tray, '16-usdc-approve-review.png')
      await signCurrentTransaction(tray, firstRequest, '17-usdc-approve-submitted.png', [
        '16a-usdc-approve-warning.png',
        '16b-usdc-approve-post-sign-warning.png'
      ])

      const secondRequest = await waitForCurrentRequest(
        tray,
        'transaction',
        new Set([firstRequest.handlerId]),
        90_000
      )
      await screenshot(tray, '18-usdc-deposit-review.png')
      await signCurrentTransaction(tray, secondRequest, '19-usdc-complete.png', [
        '18a-usdc-deposit-warning.png',
        '18b-usdc-deposit-post-sign-warning.png'
      ])
    } finally {
      await stopMining()
    }

    await integration.promise
  })

  await withStage('final activity', async () => {
    await clearPanelAndOverlays(tray)
    await selectNetwork(tray, 'Newframe Local Anvil')
    await tray.getByRole('tab', { name: 'Activity' }).click()
    await screenshot(tray, '20-final-activity.png')
  })

  if (consoleErrors.length > 0) {
    log(`renderer console errors were observed but did not fail the run: ${consoleErrors.length}`)
  }
}

async function main() {
  process.once('SIGINT', async () => {
    await cleanup()
    process.exit(130)
  })
  process.once('SIGTERM', async () => {
    await cleanup()
    process.exit(143)
  })

  try {
    await bootstrap()
    const app = await launchApp()
    await runFlow(app)
    summary.ok = true
    summary.failedStage = null
    await writeSummary()
    log(`done: ${screenshotDir}`)
  } catch (err) {
    summary.ok = false
    summary.failedStage = stage
    await writeSummary().catch(() => undefined)
    throw err
  } finally {
    await cleanup()
  }
}

await main()
