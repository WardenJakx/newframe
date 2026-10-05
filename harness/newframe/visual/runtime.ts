import { mkdtempSync } from 'node:fs'
import fsp from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

import type { BrowserContext, ConsoleMessage, ElectronApplication, Page } from 'playwright-core'

import { commandOutputCollector } from '../core/process.ts'
import { tail, withTimeout } from '../core/utils.ts'
import type {
  HarnessEvidence,
  HarnessSummary,
  PageError,
  VisualHarnessContext,
  VisualStage
} from './types.ts'

type ConsoleErrorAllowance = {
  pattern: RegExp
  reason: string
}

// Keep this list empty unless a browser/runtime diagnostic is both understood and unactionable.
// Every future entry must match narrowly and explain why fixing the underlying error is inappropriate.
const consoleErrorAllowlist: ConsoleErrorAllowance[] = []

function consoleSource(message: ConsoleMessage) {
  const location = message.location()
  return location.url ? `${location.url}:${location.line + 1}:${location.column + 1}` : undefined
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

export class VisualHarnessRuntime {
  // Each run gets its own artifacts so concurrent runs cannot overwrite each other.
  readonly outputDir =
    process.env.NEWFRAME_HARNESS_OUTPUT_DIR ?? mkdtempSync(path.join(tmpdir(), 'newframe-visual-harness-'))
  readonly screenshotDir = path.join(this.outputDir, 'screenshots')
  readonly uiTimeoutMs = Number(process.env.NEWFRAME_HARNESS_UI_TIMEOUT_MS ?? 10_000)
  readonly startedAt = Date.now()
  readonly summary: HarnessSummary = {
    durationMs: 0,
    evidence: [],
    failedStage: null,
    ok: false,
    pageErrors: [],
    screenshots: [],
    stages: [],
    startedAt: new Date(this.startedAt).toISOString()
  }

  currentStage = 'startup'
  private electronOutput = () => ''
  private monitoredPages = new WeakSet<Page>()
  private readonly browsers = new Map<string, BrowserContext>()

  log(message: string) {
    console.log(`[visual-harness] ${message}`)
  }

  fail(message: string): never {
    throw new Error(`[${this.currentStage}] ${message}`)
  }

  async prepareOutput() {
    await fsp.rm(this.screenshotDir, { recursive: true, force: true })
    await fsp.mkdir(this.screenshotDir, { recursive: true })
    await this.writeSummary()
  }

  async writeSummary() {
    this.summary.durationMs = Date.now() - this.startedAt
    await fsp.mkdir(this.outputDir, { recursive: true })
    await fsp.writeFile(
      path.join(this.outputDir, 'summary.json'),
      `${JSON.stringify(this.summary, null, 2)}\n`
    )
  }

  async screenshot(page: Page, filename: string) {
    await fsp.mkdir(this.screenshotDir, { recursive: true })
    await page.screenshot({ path: path.join(this.screenshotDir, filename) })
    await fsp.writeFile(
      path.join(this.screenshotDir, filename.replace(/\.png$/, '.aria.yml')),
      `${await page.ariaSnapshot()}\n`
    )
    this.summary.screenshots.push(filename)
    const stage = this.summary.stages.findLast((candidate) => candidate.status === 'running')
    if (stage) {
      stage.screenshots.push(filename)
    }
    await this.writeSummary()
  }

  async runStage<C extends VisualHarnessContext>(context: C, visualStage: VisualStage<C>) {
    this.currentStage = visualStage.name
    this.log(visualStage.name)
    const startedAt = Date.now()
    const stage = {
      durationMs: 0,
      evidence: [] as HarnessEvidence[],
      name: visualStage.name,
      screenshots: [] as string[],
      status: 'running' as const
    }
    this.summary.stages.push(stage)
    await this.writeSummary()

    try {
      await visualStage.run(context)
      this.assertNoUnexpectedPageErrors()
      Object.assign(stage, { durationMs: Date.now() - startedAt, status: 'passed' as const })
    } catch (error) {
      Object.assign(stage, { durationMs: Date.now() - startedAt, status: 'failed' as const })
      throw error
    } finally {
      await this.writeSummary()
    }
  }

  evidence(label: string, value: HarnessEvidence['value']) {
    const entry = { label, stage: this.currentStage, value }
    this.summary.evidence.push(entry)
    const stage = this.summary.stages.findLast((candidate) => candidate.status === 'running')
    if (stage) {
      stage.evidence.push(entry)
    }
  }

  monitorElectron(app: ElectronApplication) {
    const child = app.process()
    this.electronOutput = commandOutputCollector(child)

    app.windows().forEach(this.monitorPage)
    app.on('window', this.monitorPage)
  }

  /**
   * Holds a browser's pages and workers to the same error policy as trays, and traces it so a failure
   * leaves `<name>-trace.zip` and a screenshot of each page.
   */
  async monitorBrowser(name: string, context: BrowserContext) {
    context.pages().forEach(this.monitorPage)
    context.on('page', this.monitorPage)
    // Pages report through their own listeners; these catch the extension's service worker.
    context.on('console', (message) => {
      if (message.type() === 'error' && !message.page()) {
        this.recordPageError('console', message.text(), message.worker()?.url() ?? '', consoleSource(message))
      }
    })
    context.on('weberror', (error) => {
      if (!error.page()) {
        this.recordPageError('pageerror', error.error().message, error.location().url)
      }
    })
    this.browsers.set(name, context)
    context.once('close', () => this.browsers.delete(name))
    await context.tracing.start({ screenshots: true, snapshots: true })
  }

  assertNoUnexpectedPageErrors() {
    const unexpected = this.summary.pageErrors.filter((error) => !error.allowed)
    if (unexpected.length === 0) {
      return
    }

    this.fail(
      `Unexpected page errors: ${unexpected
        .map((error) => `${error.kind} on ${error.pageUrl || '<blank>'}: ${error.message}`)
        .join(' | ')}`
    )
  }

  startTrace(app: ElectronApplication) {
    return app.context().tracing.start({ screenshots: true, snapshots: true })
  }

  async captureElectronFailureArtifacts(app: ElectronApplication) {
    const tracePath = path.join(this.outputDir, 'trace.zip')
    await withTimeout(app.context().tracing.stop({ path: tracePath }), 'failure trace', 30_000).then(
      () => this.log(`failure trace: ${tracePath}`),
      (err: unknown) => {
        this.log(`could not save trace: ${err instanceof Error ? err.message : String(err)}`)
      }
    )

    await this.logElectronDiagnostics(app, `failure at stage "${this.currentStage}"`).catch(
      (err: unknown) => {
        this.log(
          `could not collect Electron diagnostics: ${err instanceof Error ? err.message : String(err)}`
        )
      }
    )

    const output = this.electronOutput()
    if (output) {
      this.log(`Electron process output before failure:\n${tail(output)}`)
    }

    for (const [index, page] of app.windows().entries()) {
      await withTimeout(
        this.screenshot(page, `debug-failure-tray-${index}.png`),
        `failure screenshot for tray ${index}`,
        5_000
      ).catch((err: unknown) => {
        this.log(`could not capture tray ${index}: ${err instanceof Error ? err.message : String(err)}`)
      })
    }
  }

  async captureBrowserFailureArtifacts() {
    for (const [name, context] of this.browsers) {
      const tracePath = path.join(this.outputDir, `${name}-trace.zip`)
      await withTimeout(context.tracing.stop({ path: tracePath }), `${name} failure trace`, 30_000).then(
        () => this.log(`${name} failure trace: ${tracePath}`),
        (err: unknown) => {
          this.log(`could not save ${name} trace: ${err instanceof Error ? err.message : String(err)}`)
        }
      )

      for (const [index, page] of context.pages().entries()) {
        await withTimeout(
          this.screenshot(page, `debug-failure-${name}-${index}.png`),
          `failure screenshot for ${name} page ${index}`,
          5_000
        ).catch((err: unknown) => {
          this.log(
            `could not capture ${name} page ${index}: ${err instanceof Error ? err.message : String(err)}`
          )
        })
      }
    }
  }

  private readonly monitorPage = (page: Page) => {
    if (this.monitoredPages.has(page)) {
      return
    }
    this.monitoredPages.add(page)
    page.on('console', (message) => {
      if (message.type() === 'error') {
        this.recordPageError('console', message.text(), page.url(), consoleSource(message))
      }
    })
    page.on('crash', () => this.recordPageError('crash', 'Page crashed', page.url()))
    page.on('pageerror', (err) => this.recordPageError('pageerror', err.message, page.url()))
  }

  private async logElectronDiagnostics(app: ElectronApplication, label: string) {
    const trayPages = app.windows().map((page) => page.url() || '<blank>')
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
    ).catch((err: unknown) => ({ diagnosticError: err instanceof Error ? err.message : String(err) }))

    this.log(`${label}: ${JSON.stringify({ diagnostics, trayPages })}`)
  }

  private recordPageError(kind: PageError['kind'], message: string, pageUrl: string, source?: string) {
    const allowance = consoleErrorAllowlist.find(({ pattern }) => pattern.test(message))
    const diagnostic: PageError = {
      allowed: Boolean(allowance),
      ...(allowance ? { allowance: allowance.reason } : {}),
      kind,
      message,
      pageUrl: pageUrl || '<blank>',
      ...(source ? { source } : {})
    }
    this.summary.pageErrors.push(diagnostic)
    this.log(`${allowance ? 'allowed' : 'unexpected'} ${kind}: ${message} (${pageUrl || '<blank>'})`)
    void this.writeSummary().catch(() => undefined)
  }
}
