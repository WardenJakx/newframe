import { spawn, type ChildProcess } from 'node:child_process'
import fsp from 'node:fs/promises'
import { createRequire } from 'node:module'
import net from 'node:net'
import path from 'node:path'
import process from 'node:process'

import { _electron as electron, type ElectronApplication, type Page } from 'playwright-core'

import type {
  LinkInvokeChannel,
  LinkRpcMethod,
  LinkSendChannel,
  NewframeHost
} from '../../apps/newframe/resources/bridge/contracts'

const rootDir = path.resolve(import.meta.dirname, '../..')
const appDir = path.join(rootDir, 'apps/newframe')
const contractsDir = path.join(rootDir, 'newframe-contracts')
const outputDir = process.env.NEWFRAME_HARNESS_OUTPUT_DIR || '/tmp/newframe-visual-harness'
const screenshotDir = path.join(outputDir, 'screenshots')

const anvilPort = 8545
const localTradeServicePort = 8422
const newframeRpcPort = 1248
const uiTimeoutMs = Number(process.env.NEWFRAME_HARNESS_UI_TIMEOUT_MS || 10_000)
const anvilRpcUrl = `http://127.0.0.1:${anvilPort}`
const localTradeServiceHealthUrl = `http://127.0.0.1:${localTradeServicePort}/health`
const harnessOrigin = 'newframe-contracts.local'
const harnessAccountAddress = '0x35f9179059a691d8beecf82fe112f7277e018588'
const dappLauncherFrameId = 'dappLauncher'
const nativeCurrencyAddress = '0x0000000000000000000000000000000000000000'
const wethAddress = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
const anvilChainId = 31337
const oneEthWei = 1_000_000_000_000_000_000n

const passwordEnvKeys = ['NEWFRAME_HARNESS_PASSWORD', 'FRAME_HARNESS_PASSWORD']
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
  child: ChildProcess
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
    signers?: Record<string, unknown>
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

type ElectronDiagnostics = {
  appReady: boolean
  mainPid: number
  userData: string
  windows: Array<{
    crashed: boolean
    destroyed: boolean
    id: number
    loading: boolean
    title: string
    url: string
    visible: boolean
  }>
}

let stage = 'startup'
const summary: HarnessSummary = { ok: false, failedStage: null, screenshots: [] }
let electronApp: ElectronApplication | undefined
let anvilProcess: ChildProcess | undefined
let localTradeServiceProcess: ChildProcess | undefined
const runningCommands = new Set<RunningCommand>()
let electronOutput = () => ''
let cleanupStarted = false

function log(message: string) {
  console.log(`[visual-harness] ${message}`)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function withTimeout<T>(promise: Promise<T>, label: string, timeoutMs = uiTimeoutMs) {
  let timer: NodeJS.Timeout | undefined

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)
      })
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
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

async function logElectronDiagnostics(app: ElectronApplication, label: string) {
  const rendererPages = app.windows().map((page) => page.url() || '<blank>')
  const diagnostics = await withTimeout(
    app.evaluate(({ app, BrowserWindow }) => {
      return {
        appReady: app.isReady(),
        mainPid: process.pid,
        userData: app.getPath('userData'),
        windows: BrowserWindow.getAllWindows().map((window) => ({
          crashed: window.webContents.isCrashed(),
          destroyed: window.isDestroyed(),
          id: window.id,
          loading: window.webContents.isLoading(),
          title: window.getTitle(),
          url: window.webContents.getURL(),
          visible: window.isVisible()
        }))
      } satisfies ElectronDiagnostics
    }),
    `${label} main-process diagnostics`,
    2_000
  ).catch((err) => ({ diagnosticError: err instanceof Error ? err.message : String(err) }))

  log(`${label}: ${JSON.stringify({ diagnostics, rendererPages })}`)
}

function monitorElectron(app: ElectronApplication) {
  const child = app.process()
  electronOutput = commandOutputCollector(child)

  const monitorPage = (page: Page) => {
    page.on('crash', () => log(`Electron renderer crashed: ${page.url() || '<blank>'}`))
    page.on('pageerror', (err) => log(`Electron renderer page error: ${err.message}`))
  }

  app.windows().forEach(monitorPage)
  app.on('window', monitorPage)
  app.on('close', () => {
    if (!cleanupStarted) {
      log(`Electron application closed unexpectedly with exit code ${child.exitCode ?? 'unknown'}`)
    }
  })
}

async function captureElectronFailureArtifacts(app: ElectronApplication) {
  await logElectronDiagnostics(app, `failure at stage "${stage}"`).catch((err) => {
    log(`could not collect Electron diagnostics: ${err instanceof Error ? err.message : String(err)}`)
  })

  const output = electronOutput()
  if (output) log(`Electron process output before failure:\n${tail(output)}`)

  for (const [index, page] of app.windows().entries()) {
    await withTimeout(
      screenshot(page, `debug-failure-renderer-${index}.png`),
      `failure screenshot for renderer ${index}`,
      5_000
    ).catch((err) => {
      log(`could not capture renderer ${index}: ${err instanceof Error ? err.message : String(err)}`)
    })
  }
}

function readHarnessPassword() {
  for (const key of passwordEnvKeys) {
    const value = process.env[key]
    if (value) return value
  }
  return ''
}

function newframeEnv() {
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] =>
          entry[1] !== undefined && entry[0] !== 'ELECTRON_RUN_AS_NODE' && !passwordEnvKeys.includes(entry[0])
      )
    ),
    NODE_ENV: 'production',
    FRAME_PROFILE: 'dev'
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

async function waitForHttpOk(url: string, label: string, timeoutMs = 15_000) {
  const started = Date.now()
  let lastError: unknown

  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url)
      if (response.ok) return
      lastError = new Error(`${label} returned HTTP ${response.status}`)
    } catch (err) {
      lastError = err
    }

    await sleep(250)
  }

  fail(
    `Timed out waiting for ${label} at ${url}${lastError instanceof Error ? `: ${lastError.message}` : ''}`
  )
}

function commandOutputCollector(child: ChildProcess) {
  let output = ''
  const append = (chunk: Buffer) => {
    output = tail(output + chunk.toString(), 20_000)
  }

  child.stdout?.on('data', append)
  child.stderr?.on('data', append)

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
        reject(new Error(`${label} failed to start: ${err.message}`, { cause: err }))
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

async function stopProcess(child: ChildProcess | undefined, label: string) {
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

  if (electronApp) {
    const app = electronApp
    electronApp = undefined
    const child = app.process()

    await Promise.race([
      app.close().catch(() => undefined),
      sleep(3_000).then(() => {
        if (child.exitCode === null) child.kill('SIGKILL')
      })
    ])
    log('stopped electron')
  }

  await stopProcess(localTradeServiceProcess, 'local trade service').catch(() => undefined)
  localTradeServiceProcess = undefined

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

async function assertColorTokens(page: Page, renderer: string) {
  await withTimeout(page.waitForLoadState('load', { timeout: uiTimeoutMs }), `${renderer} load state`)
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
  const result = await withTimeout(evaluation, `${renderer} color-token evaluation`)

  if (!result.semanticValue || !result.primitiveValue || !result.actionValue) {
    fail(`${renderer} is missing generated color custom properties: ${JSON.stringify(result)}`)
  }
  if (result.semanticColor !== result.primitiveColor) {
    fail(`${renderer} semantic background does not resolve to its primitive`)
  }
  if (!result.colorMixSupported || !result.alphaColor || result.alphaColor === 'rgba(0, 0, 0, 0)') {
    fail(`${renderer} does not resolve color-mix() alpha tokens`)
  }
}

async function screenshotDashboardVisualStates(app: ElectronApplication, tray: Page) {
  const dash = await waitForElectronPage(app, 'bundle/dash.html')
  await assertColorTokens(dash, 'Dashboard')
  await screenshot(dash, '00a-dashboard-home.png')

  await trayAction(tray, 'navDash', { view: 'tokens', data: {} })
  await sleep(800)
  await screenshot(dash, '00b-dashboard-tokens.png')

  await trayAction(tray, 'navDash', { view: 'dapps', data: {} })
  await sleep(800)
  await screenshot(dash, '00c-dashboard-dapps.png')

  const signerId = Object.keys((await getAppState(tray)).main?.signers || {})[0]
  if (signerId) {
    await trayAction(tray, 'navDash', { view: 'expandedSigner', data: { signer: signerId } })
    await sleep(800)
    await screenshot(dash, '00d-dashboard-signer.png')
  }

  await trayAction(tray, 'backDash', 10)
}

async function waitForElectronPage(app: ElectronApplication, urlPart: string, timeoutMs = uiTimeoutMs) {
  const started = Date.now()
  let lastLog = started

  while (Date.now() - started < timeoutMs) {
    const page = app.windows().find((candidate) => candidate.url().includes(urlPart))
    if (page) return page

    if (Date.now() - lastLog > 2_500) {
      lastLog = Date.now()
      const urls = app.windows().map((candidate) => candidate.url() || '<blank>')
      log(`waiting for ${urlPart}; pages: ${urls.join(', ') || '<none>'}`)
    }

    await sleep(250)
  }

  fail(`Timed out waiting for Electron page containing ${urlPart}`)
}

function canonicalAssetId(chainId: number, address: string) {
  return `${chainId}:${address.toLowerCase()}`
}

function launcherRoute(route: 'send' | 'trade', assetId = '') {
  return assetId ? `/${route}?assetId=${encodeURIComponent(assetId)}` : `/${route}`
}

async function waitForDappRoute(page: Page, route: 'send' | 'trade') {
  await page.waitForURL((url) => url.hash.startsWith(`#/${route}`), { timeout: uiTimeoutMs })
}

type HostOperation =
  | { kind: 'invoke'; channel: LinkInvokeChannel; args: unknown[] }
  | { kind: 'rpc'; method: LinkRpcMethod; args: unknown[]; wait: boolean }
  | { kind: 'send'; channel: LinkSendChannel; args: unknown[] }

async function evaluateHost(page: Page, operation: HostOperation) {
  return page.evaluate(async (operation) => {
    const host = (window as typeof window & { __NEWFRAME_HOST__?: NewframeHost }).__NEWFRAME_HOST__

    if (!host) throw new Error('Newframe host bridge is not available')

    if (operation.kind === 'invoke') {
      return host.invoke(operation.channel, operation.args)
    }

    if (operation.kind === 'send') {
      host.send(operation.channel, operation.args)
      return undefined
    }

    const response = host.rpc(operation.method, operation.args)
    if (operation.wait) return response

    void response.catch(() => undefined)
    return undefined
  }, operation)
}

async function linkRpc<T>(page: Page, method: LinkRpcMethod, ...args: unknown[]): Promise<T> {
  const response = await evaluateHost(page, { kind: 'rpc', method, args, wait: true })

  if (Array.isArray(response)) {
    const [err, value] = response as [unknown, T]
    if (err) throw new Error(typeof err === 'string' ? err : JSON.stringify(err))
    return value
  }

  return response as T
}

async function linkRpcNoWait(page: Page, method: LinkRpcMethod, ...args: unknown[]) {
  await evaluateHost(page, { kind: 'rpc', method, args, wait: false })
}

async function linkSend(page: Page, channel: LinkSendChannel, ...args: unknown[]) {
  await evaluateHost(page, { kind: 'send', channel, args })
}

async function linkInvoke<T>(page: Page, channel: LinkInvokeChannel, ...args: unknown[]): Promise<T> {
  const response = await evaluateHost(page, { kind: 'invoke', channel, args })

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

function normalizeAddChain(chain: AddChain | undefined) {
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

async function signCurrentSignature(page: Page, request: CurrentRequest, submittedScreenshot: string) {
  await linkRpcNoWait(page, 'approveRequest', request)
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

async function openTradeTicket(app: ElectronApplication, tray: Page) {
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

async function screenshotTradeTicketVisualStates(app: ElectronApplication, tray: Page) {
  const tradePage = await openTradeTicket(app, tray)
  await assertColorTokens(tradePage, 'Dapp')
  await assertTradeTicketVisualControls(tradePage)
  await screenshot(tradePage, '10a-trade-market-open.png')

  await tradePage.getByRole('button', { name: /Switch to (BUY|SELL)/ }).click()
  await tradePage.getByRole('button', { name: /Switch to (BUY|SELL)/ }).waitFor({
    state: 'visible',
    timeout: 5_000
  })
  await screenshot(tradePage, '10b-trade-direction-switched.png')

  await tradePage.getByRole('button', { name: /Select target asset/i }).click()
  await tradePage.getByRole('option', { name: /\bWETH\b.*\$0\.00/i }).waitFor({
    state: 'visible',
    timeout: 5_000
  })
  await screenshot(tradePage, '10c-trade-target-asset-menu.png')

  await tradePage.getByRole('button', { name: /Select target asset/i }).click()
  await tradePage.getByRole('button', { name: /Select contra asset/i }).click()
  await tradePage.getByRole('option', { name: /\bUSDC\b.*\$0\.00/i }).waitFor({
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

async function waitForFlashOrder(
  page: Page,
  predicate: (order: any) => boolean,
  timeoutMs: number,
  message: string
) {
  const state = await waitForState(
    page,
    (candidate) => Object.values((candidate.main as any)?.orders || {}).some(predicate),
    timeoutMs,
    message
  )

  return Object.values((state.main as any)?.orders || {}).find(predicate)
}

async function ensureTradeSellSide(tradePage: Page) {
  const switchToSell = tradePage.getByRole('button', { name: /Switch to SELL/i })

  if (await switchToSell.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await switchToSell.click()
  }

  await tradePage.getByLabel('WETH amount').waitFor({ state: 'visible', timeout: 5_000 })
}

async function runTradeMarketE2E(app: ElectronApplication, tray: Page) {
  const tradePage = await openTradeTicket(app, tray)

  await ensureTradeSellSide(tradePage)
  await tradePage.getByLabel('WETH amount').fill('0.01')
  await tradePage
    .getByRole('button', { name: /Approve WETH/i })
    .waitFor({ state: 'visible', timeout: 20_000 })
  await screenshot(tradePage, '21a-trade-market-quoted.png')
  await tradePage.getByRole('button', { name: /Approve WETH/i }).click()

  const approveRequest = await waitForCurrentRequest(tray, 'transaction', new Set(), 30_000)
  await screenshot(tray, '21b-trade-market-approve-review.png')
  await signCurrentTransaction(tray, approveRequest, '21c-trade-market-approve-submitted.png', [
    '21b-trade-market-approve-warning.png',
    '21c-trade-market-approve-post-sign-warning.png'
  ])

  await tradePage
    .getByRole('button', { name: /Review\/sign/i })
    .waitFor({ state: 'visible', timeout: 20_000 })
  await screenshot(tradePage, '21d-trade-market-ready-to-sign.png')
  await tradePage.getByRole('button', { name: /Review\/sign/i }).click()

  const signRequest = await waitForCurrentRequest(tray, 'signTypedData', new Set(), 30_000)
  await screenshot(tray, '21e-trade-market-sign-review.png')
  await signCurrentSignature(tray, signRequest, '21f-trade-market-sign-submitted.png')

  await waitForFlashOrder(
    tray,
    (order) => order?.orderType === 'market' && order?.status === 'filled',
    30_000,
    'Market Flash order did not fill'
  )
  await screenshot(tray, '21g-trade-market-filled.png')
  await clearPanelAndOverlays(tray)
}

async function runTradeNonMarketE2E(app: ElectronApplication, tray: Page) {
  const tradePage = await openTradeTicket(app, tray)

  await ensureTradeSellSide(tradePage)
  await tradePage.getByRole('tab', { name: 'Limit' }).click()
  await tradePage.getByLabel('Limit price').fill('2500')
  await tradePage.getByLabel('WETH amount').fill('0.01')
  await tradePage
    .getByRole('button', { name: /Review\/sign/i })
    .waitFor({ state: 'visible', timeout: 20_000 })
  await screenshot(tradePage, '22a-trade-limit-quoted.png')
  await tradePage.getByRole('button', { name: /Review\/sign/i }).click()

  const signRequest = await waitForCurrentRequest(tray, 'signTypedData', new Set(), 30_000)
  await screenshot(tray, '22b-trade-limit-sign-review.png')
  await signCurrentSignature(tray, signRequest, '22c-trade-limit-sign-submitted.png')

  const order = await waitForFlashOrder(
    tray,
    (candidate) => candidate?.orderType === 'limit' && candidate?.status === 'accepted' && candidate?.open,
    15_000,
    'Limit Flash order was not accepted as open'
  )

  await sleep(4_000)

  const latest = await getAppState(tray)
  const stored = (latest.main as any)?.orders?.[(order as any).orderId]
  if (!stored?.open || stored.status !== 'accepted') fail('Limit Flash order filled or closed unexpectedly')

  await screenshot(tray, '22d-trade-limit-open.png')
  await clearPanelAndOverlays(tray)
}

async function bootstrap() {
  await withStage('preflight', async () => {
    await fsp.mkdir(screenshotDir, { recursive: true })
    await writeSummary()
    createRequire(path.join(appDir, 'package.json'))('electron')
    const password = readHarnessPassword()
    log(`unlock password configured: ${password.length > 0}`)
    if (!password) fail('Newframe unlock password is not configured')

    await Promise.all([
      ensureCommand('bun'),
      ensureCommand('make'),
      ensureCommand('anvil'),
      ensureCommand('cast'),
      ensureCommand('forge'),
      assertPortFree(anvilPort, 'Anvil'),
      assertPortFree(localTradeServicePort, 'Local trade service'),
      assertPortFree(newframeRpcPort, 'Newframe RPC')
    ])
  })

  await withStage('bootstrap build and anvil', async () => {
    const child = spawn(
      'anvil',
      ['--host', '127.0.0.1', '--port', String(anvilPort), '--chain-id', String(anvilChainId)],
      {
        cwd: contractsDir,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe']
      }
    )
    anvilProcess = child
    commandOutputCollector(child)

    const seed = runCommand('contracts seed', 'make', ['seed'], contractsDir)
    const build = (async () => {
      await runCommand('newframe compile', 'bun', ['run', 'compile'], appDir)
      await runCommand('newframe bundle', 'bun', ['run', 'bundle'], appDir)
    })()

    await Promise.all([seed, build])
  })

  await withStage('local trade service', async () => {
    const child = spawn('bun', ['./scripts/local-trade-service.ts'], {
      cwd: appDir,
      env: {
        ...process.env,
        ANVIL_RPC_URL: anvilRpcUrl,
        FLASH_LOCAL_TRADE_PORT: String(localTradeServicePort)
      },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    localTradeServiceProcess = child
    const output = commandOutputCollector(child)
    const exitPromise = new Promise<never>((_, reject) => {
      child.once('error', (err) => {
        reject(new Error(`Local trade service failed to start: ${err.message}`, { cause: err }))
      })
      child.once('exit', (code, signal) => {
        if (!cleanupStarted) {
          reject(
            new Error(
              `Local trade service exited with ${signal || `code ${code ?? 'unknown'}`}${
                output() ? `\n\n${tail(output())}` : ''
              }`
            )
          )
        }
      })
    })
    exitPromise.catch(() => undefined)

    await Promise.race([waitForHttpOk(localTradeServiceHealthUrl, 'local trade service'), exitPromise])
  })
}

async function launchApp() {
  return withStage('launch electron', async () => {
    const requireFromApp = createRequire(path.join(appDir, 'package.json'))
    const electronPath = requireFromApp('electron') as string

    const app = await electron.launch({
      args: ['./compiled/main'],
      colorScheme: 'no-preference',
      cwd: appDir,
      executablePath: electronPath,
      env: newframeEnv(),
      timeout: 15_000
    })
    app.context().setDefaultTimeout(uiTimeoutMs)
    app.context().setDefaultNavigationTimeout(uiTimeoutMs)
    electronApp = app
    monitorElectron(app)
    return app
  })
}

async function unlockWallet(tray: Page) {
  await withStage('lock screen', async () => {
    const unlockDialog = tray.getByRole('dialog', { name: 'Unlock Newframe' })
    await unlockDialog.waitFor({ state: 'visible', timeout: uiTimeoutMs })
    await screenshot(tray, '01-lock-screen.png')
  })

  await withStage('unlock', async () => {
    const password = readHarnessPassword()
    log(`unlock attempt has password: ${password.length > 0}`)
    if (!password) fail('Newframe unlock password is not configured')

    const dialog = tray.getByRole('dialog', { name: 'Unlock Newframe' })
    const passwordInput = dialog.getByRole('textbox', { name: 'Newframe password' })
    const unlockButton = dialog.getByRole('button', { name: 'Unlock' })
    const mainMenu = tray.getByRole('button', { name: 'Main menu' })

    try {
      await passwordInput.fill(password)
      log(`unlock input populated: ${(await passwordInput.inputValue()).length > 0}`)
      log(`unlock button enabled: ${!(await unlockButton.isDisabled())}`)
      await unlockButton.click()
      await mainMenu.waitFor({ state: 'visible', timeout: uiTimeoutMs })
    } catch (err) {
      const diagnostics = {
        buttonDisabled: await unlockButton.isDisabled().catch(() => null),
        dialogText: await dialog.innerText().catch(() => '<unavailable>'),
        dialogVisible: await dialog.isVisible().catch(() => false),
        inputPopulated: await passwordInput
          .inputValue()
          .then((value) => value.length > 0)
          .catch(() => false),
        mainMenuVisible: await mainMenu.isVisible().catch(() => false)
      }
      log(`unlock failed: ${JSON.stringify(diagnostics)}`)
      throw err
    }
  })
}

async function screenshotTrayOverlayVisualStates(tray: Page) {
  const mainMenuButton = tray.getByRole('button', { name: 'Main menu' })

  await mainMenuButton.click()
  const menu = tray.getByRole('dialog', { name: 'Main menu' })
  await menu.waitFor({ state: 'visible' })
  await sleep(500)
  await screenshot(tray, '02a-main-menu.png')

  for (const [label, filename] of [
    ['Requests', '02b-requests-overlay.png'],
    ['Dapps', '02c-dapps-overlay.png'],
    ['Settings', '02d-settings-overlay.png']
  ] as const) {
    await menu.getByRole('button', { name: label }).click()
    const overlay = tray.getByRole('dialog', { name: label })
    await overlay.waitFor({ state: 'visible' })
    await sleep(500)
    await screenshot(tray, filename)
    await overlay.getByRole('button', { name: 'Back' }).click()
    await menu.waitFor({ state: 'visible' })
    await sleep(500)
  }

  await menu.getByRole('button', { name: 'Close menu' }).click()
  await menu.waitFor({ state: 'hidden' })

  await tray.getByRole('button', { name: 'Network filter' }).click()
  const networks = tray.getByRole('dialog', { name: 'Networks' })
  await networks.waitFor({ state: 'visible' })
  await sleep(500)
  await screenshot(tray, '02e-networks-overlay.png')
  await networks.getByRole('button', { name: 'Back' }).click()
  await networks.waitFor({ state: 'hidden' })
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

async function runFlow(app: ElectronApplication) {
  const tray = await withStage('wait for tray renderer', async () => {
    return waitForElectronPage(app, 'bundle/tray.html')
  })
  const consoleErrors: string[] = []

  tray.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })

  await unlockWallet(tray)
  await withStage('tray readiness', async () => assertColorTokens(tray, 'Tray'))
  await withStage('dashboard visuals', async () => screenshotDashboardVisualStates(app, tray))
  await resetHarnessState(tray)
  await screenshot(tray, '02-unlocked-home.png')
  await withStage('tray overlay visuals', async () => screenshotTrayOverlayVisualStates(tray))

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

  await withStage('trade market e2e', async () => {
    await runTradeMarketE2E(app, tray)
  })

  await withStage('trade non-market e2e', async () => {
    await runTradeNonMarketE2E(app, tray)
  })

  await withStage('built-in send', async () => {
    const sendEthButton = tray.getByRole('button', { name: 'Send ETH' })

    if (!(await sendEthButton.isVisible({ timeout: 1_000 }).catch(() => false))) {
      await tray.getByRole('button', { name: 'ETH asset details' }).click()
      await tray.getByRole('dialog', { name: 'Asset details' }).waitFor({ state: 'visible' })
    }

    await sendEthButton.click()
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
    if (electronApp) await captureElectronFailureArtifacts(electronApp)
    await writeSummary().catch(() => undefined)
    throw err
  } finally {
    await cleanup()
  }
}

await main()
