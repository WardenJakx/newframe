import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { chromium, type BrowserContext, type Page, type Worker } from 'playwright-core'

import { ports, rootDir } from '../core/config.ts'
import { runCommand, startCommand } from '../core/process.ts'
import { trackTemporaryPath } from '../core/reaper.ts'
import type { HarnessService } from '../core/service.ts'
import { withTimeout } from '../core/utils.ts'
import type { VisualHarnessRuntime } from '../visual/runtime.ts'
import { dappHtml, dappUrl } from './dapp.ts'

const extensionAppDir = path.join(rootDir, 'apps/newframe-extension')

type ExtensionWorkerGlobal = {
  chrome: { tabs: { create(properties: { url: string; active: boolean }): Promise<unknown> } }
}

type Started = {
  context: BrowserContext
  dapp: Page
  extensionId: string
}

const isExtensionWorker = (worker: Worker) => worker.url().startsWith('chrome-extension://')

async function ensureChromium() {
  if (!existsSync(chromium.executablePath())) {
    const playwright = path.join(rootDir, 'node_modules/.bin/playwright-core')
    await runCommand('install Chromium', playwright, ['install', 'chromium'], rootDir)
  }
}

/**
 * Chromium with the built Newframe extension and the example dapp open. The extension is built against the
 * harness desktop app's local API port, so it never reaches a Newframe the developer is running.
 */
export class ExtensionBrowser implements HarnessService<ExtensionBrowser> {
  readonly name = 'Chromium with the Newframe extension'
  failure?: Promise<never>

  private readonly runtime: VisualHarnessRuntime
  private readonly temporaryPaths: Array<{ directory: string; release: () => void }> = []
  private context?: BrowserContext
  private started?: Started
  private stopping = false

  constructor(runtime: VisualHarnessRuntime) {
    this.runtime = runtime
  }

  get extensionId() {
    return this.require().extensionId
  }

  get dapp() {
    return this.require().dapp
  }

  async start() {
    if (this.started) {
      return this
    }

    await ensureChromium()
    const extensionDir = await this.temporaryDirectory('newframe-extension-')
    await startCommand('newframe extension build', 'bun', ['run', 'build'], extensionAppDir, {
      env: {
        ...process.env,
        NEWFRAME_LOCAL_API_PORT: String(ports.visualRpc),
        NEWFRAME_EXTENSION_OUTDIR: extensionDir
      }
    }).promise

    const context = await chromium.launchPersistentContext(
      await this.temporaryDirectory('newframe-extension-profile-'),
      {
        channel: 'chromium',
        headless: true,
        args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`],
        timeout: 30_000
      }
    )
    this.context = context
    context.setDefaultTimeout(this.runtime.uiTimeoutMs)
    this.failure = new Promise<never>((_, reject) => {
      context.once('close', () => {
        if (!this.stopping) {
          reject(new Error('Chromium closed unexpectedly'))
        }
      })
    })
    this.failure.catch(() => undefined)
    await this.runtime.monitorBrowser('extension', context)

    const worker =
      context.serviceWorkers().find(isExtensionWorker) ??
      (await context.waitForEvent('serviceworker', { predicate: isExtensionWorker }))
    await context.route(`${dappUrl}**`, (route) =>
      new URL(route.request().url()).pathname === '/'
        ? route.fulfill({ contentType: 'text/html', body: dappHtml() })
        : route.fulfill({ status: 404 })
    )
    const dapp = context.pages()[0] ?? (await context.newPage())
    await dapp.goto(dappUrl)
    this.started = { context, dapp, extensionId: new URL(worker.url()).host }
    return this
  }

  /**
   * Opens the extension's popup page in a background tab beside the dapp. Playwright cannot reach the real
   * action popup, but this page sees the dapp as the active tab just as the popup does. Close it when done,
   * as a human closes the popup.
   */
  async openPopup() {
    const { context, extensionId } = this.require()
    // The browser may stop an idle service worker and start a new one, so look it up each time.
    const worker = context.serviceWorkers().find(isExtensionWorker)
    if (!worker) {
      throw new Error('The Newframe extension service worker is not running')
    }

    const url = `chrome-extension://${extensionId}/settings.html`
    const opened = context.waitForEvent('page')
    await worker.evaluate(async (url) => {
      const { chrome } = globalThis as unknown as ExtensionWorkerGlobal
      await chrome.tabs.create({ url, active: false })
    }, url)
    const popup = await opened
    await popup.setViewportSize({ width: 360, height: 600 })
    await popup.waitForURL(url)
    return popup
  }

  async stop() {
    this.stopping = true
    const context = this.context
    this.context = undefined
    this.started = undefined
    await withTimeout(context?.close() ?? Promise.resolve(), 'Chromium close', 10_000).catch(() => undefined)
    for (const { directory, release } of this.temporaryPaths.splice(0)) {
      await rm(directory, { recursive: true, force: true })
      release()
    }
  }

  private async temporaryDirectory(prefix: string) {
    const directory = await mkdtemp(path.join(tmpdir(), prefix))
    this.temporaryPaths.push({ directory, release: trackTemporaryPath(directory) })
    return directory
  }

  private require() {
    if (!this.started) {
      throw new Error('The extension browser has not started; start it with context.services.start()')
    }
    return this.started
  }
}
