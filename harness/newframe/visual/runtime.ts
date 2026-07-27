import fsp from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import type { ElectronApplication, Page } from 'playwright-core'

import { commandOutputCollector } from '../core/process.ts'
import { tail, withTimeout } from '../core/utils.ts'
import type {
  HarnessEvidence,
  HarnessSummary,
  RendererError,
  VisualHarnessContext,
  VisualStage
} from './types.ts'

type ConsoleErrorAllowance = {
  pattern: RegExp
  reason: string
}

// Keep this list empty unless a browser/runtime diagnostic is both understood and unactionable.
// Every future entry must match narrowly and explain why fixing the underlying error is inappropriate.
const rendererConsoleErrorAllowlist: ConsoleErrorAllowance[] = []

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
  readonly outputDir = process.env.NEWFRAME_HARNESS_OUTPUT_DIR || '/tmp/newframe-visual-harness'
  readonly screenshotDir = path.join(this.outputDir, 'screenshots')
  readonly uiTimeoutMs = Number(process.env.NEWFRAME_HARNESS_UI_TIMEOUT_MS || 10_000)
  readonly startedAt = Date.now()
  readonly summary: HarnessSummary = {
    durationMs: 0,
    evidence: [],
    failedStage: null,
    ok: false,
    rendererErrors: [],
    screenshots: [],
    stages: [],
    startedAt: new Date(this.startedAt).toISOString()
  }

  currentStage = 'startup'
  private electronOutput = () => ''
  private monitoredPages = new WeakSet<Page>()

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
    await page.bringToFront().catch(() => undefined)
    await page.screenshot({ path: path.join(this.screenshotDir, filename) })
    this.summary.screenshots.push(filename)
    const stage = this.summary.stages.findLast((candidate) => candidate.status === 'running')
    if (stage) stage.screenshots.push(filename)
    await this.writeSummary()
  }

  async runStage(context: VisualHarnessContext, visualStage: VisualStage) {
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
      this.assertNoUnexpectedRendererErrors()
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
    if (stage) stage.evidence.push(entry)
  }

  monitorElectron(app: ElectronApplication) {
    const child = app.process()
    this.electronOutput = commandOutputCollector(child)

    const monitorPage = (page: Page) => {
      if (this.monitoredPages.has(page)) return
      this.monitoredPages.add(page)
      page.on('console', (message) => {
        if (message.type() !== 'error') return
        const location = message.location()
        const source = location.url
          ? `${location.url}:${location.lineNumber + 1}:${location.columnNumber + 1}`
          : undefined
        this.recordRendererError('console', message.text(), page.url(), source)
      })
      page.on('crash', () => this.recordRendererError('crash', 'Renderer crashed', page.url()))
      page.on('pageerror', (err) => this.recordRendererError('pageerror', err.message, page.url()))
    }

    app.windows().forEach(monitorPage)
    app.on('window', monitorPage)
  }

  assertNoUnexpectedRendererErrors() {
    const unexpected = this.summary.rendererErrors.filter((error) => !error.allowed)
    if (unexpected.length === 0) return

    this.fail(
      `Unexpected renderer errors: ${unexpected
        .map((error) => `${error.kind} on ${error.pageUrl || '<blank>'}: ${error.message}`)
        .join(' | ')}`
    )
  }

  async captureElectronFailureArtifacts(app: ElectronApplication) {
    await this.logElectronDiagnostics(app, `failure at stage "${this.currentStage}"`).catch((err) => {
      this.log(`could not collect Electron diagnostics: ${err instanceof Error ? err.message : String(err)}`)
    })

    const output = this.electronOutput()
    if (output) this.log(`Electron process output before failure:\n${tail(output)}`)

    for (const [index, page] of app.windows().entries()) {
      await withTimeout(
        this.screenshot(page, `debug-failure-renderer-${index}.png`),
        `failure screenshot for renderer ${index}`,
        5_000
      ).catch((err) => {
        this.log(`could not capture renderer ${index}: ${err instanceof Error ? err.message : String(err)}`)
      })
    }
  }

  private async logElectronDiagnostics(app: ElectronApplication, label: string) {
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

    this.log(`${label}: ${JSON.stringify({ diagnostics, rendererPages })}`)
  }

  private recordRendererError(
    kind: RendererError['kind'],
    message: string,
    pageUrl: string,
    source?: string
  ) {
    const allowance = rendererConsoleErrorAllowlist.find(({ pattern }) => pattern.test(message))
    const diagnostic: RendererError = {
      allowed: Boolean(allowance),
      ...(allowance ? { allowance: allowance.reason } : {}),
      kind,
      message,
      pageUrl: pageUrl || '<blank>',
      ...(source ? { source } : {})
    }
    this.summary.rendererErrors.push(diagnostic)
    this.log(`${allowance ? 'allowed' : 'unexpected'} renderer ${kind}: ${message} (${pageUrl || '<blank>'})`)
    void this.writeSummary().catch(() => undefined)
  }
}
