import fsp from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import type { ElectronApplication, Page } from 'playwright-core'

import { commandOutputCollector } from '../core/process.ts'
import { tail, withTimeout } from '../core/utils.ts'
import type { HarnessSummary, VisualHarnessContext, VisualStage } from './types.ts'

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
  readonly summary: HarnessSummary = { ok: false, failedStage: null, screenshots: [] }

  currentStage = 'startup'
  private electronOutput = () => ''

  log(message: string) {
    console.log(`[visual-harness] ${message}`)
  }

  fail(message: string): never {
    throw new Error(`[${this.currentStage}] ${message}`)
  }

  async prepareOutput() {
    await fsp.mkdir(this.screenshotDir, { recursive: true })
    await this.writeSummary()
  }

  async writeSummary() {
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
    await this.writeSummary()
  }

  async runStage(context: VisualHarnessContext, visualStage: VisualStage) {
    this.currentStage = visualStage.name
    this.log(visualStage.name)
    await visualStage.run(context)
  }

  monitorElectron(app: ElectronApplication) {
    const child = app.process()
    this.electronOutput = commandOutputCollector(child)

    const monitorPage = (page: Page) => {
      page.on('crash', () => this.log(`Electron renderer crashed: ${page.url() || '<blank>'}`))
      page.on('pageerror', (err) => this.log(`Electron renderer page error: ${err.message}`))
    }

    app.windows().forEach(monitorPage)
    app.on('window', monitorPage)
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
}
