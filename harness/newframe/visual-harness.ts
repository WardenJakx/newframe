import process from 'node:process'
import path from 'node:path'

import { _electron as electron, type ElectronApplication } from 'playwright-core'

import { appDir, electronExecutable, readHarnessPassword } from './core/config.ts'
import { ensureCommand } from './core/process.ts'
import { expectSuccessfulExit, ProcessService } from './core/process-service.ts'
import { HarnessRuntime, installSignalHandlers } from './core/service.ts'
import { createAnvilService } from './services/anvil.ts'
import { createContractsCommandService } from './services/contracts.ts'
import { ElectronApplicationService } from './services/electron.ts'
import { createLocalTradeService } from './services/local-trade.ts'
import { AnvilClient } from './visual/anvil-client.ts'
import { NewframeDriver, waitForElectronPage } from './visual/driver.ts'
import { VisualHarnessRuntime } from './visual/runtime.ts'
import { visualStages } from './visual/stages/index.ts'
import type { VisualHarnessContext } from './visual/types.ts'

function buildCommand(name: string, args: string[], cwd: string) {
  return new ProcessService({
    name,
    command: args[0],
    args: args.slice(1),
    spawn: {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    },
    exitIsFailure: false
  })
}

async function bootstrap(services: HarnessRuntime, visual: VisualHarnessRuntime) {
  visual.currentStage = 'preflight'
  visual.log('preflight')
  await visual.prepareOutput()
  electronExecutable()

  const password = readHarnessPassword()
  visual.log(`unlock password configured: ${password.length > 0}`)
  if (!password) visual.fail('Newframe unlock password is not configured')

  await Promise.all([
    ensureCommand('bun'),
    ensureCommand('make'),
    ensureCommand('anvil'),
    ensureCommand('cast'),
    ensureCommand('forge')
  ])

  visual.currentStage = 'bootstrap build and anvil'
  visual.log('bootstrap build and anvil')
  await services.start(createAnvilService())

  const [seed, compile] = await Promise.all([
    services.start(createContractsCommandService('contracts seed', 'seed')),
    services.start(buildCommand('newframe compile', ['bun', 'run', 'compile'], appDir))
  ])
  await services.watch(
    Promise.all([
      expectSuccessfulExit(seed, 'contracts seed'),
      expectSuccessfulExit(compile, 'newframe compile')
    ])
  )

  const bundle = await services.start(buildCommand('newframe bundle', ['bun', 'run', 'bundle'], appDir))
  await services.watch(expectSuccessfulExit(bundle, 'newframe bundle'))

  visual.currentStage = 'local Flash service'
  visual.log('local Flash service')
  await services.watch(services.start(createLocalTradeService()))
}

async function createContext(
  app: ElectronApplication,
  services: HarnessRuntime,
  runtime: VisualHarnessRuntime
): Promise<VisualHarnessContext> {
  runtime.currentStage = 'wait for tray renderer'
  runtime.log('wait for tray renderer')
  const tray = await waitForElectronPage(app, 'bundle/tray.html', runtime)
  const consoleErrors: string[] = []
  tray.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })

  const anvil = new AnvilClient()
  return {
    anvil,
    app,
    consoleErrors,
    driver: new NewframeDriver(app, tray, runtime, anvil),
    runtime,
    services,
    tray
  }
}

export async function runVisualHarness() {
  const visual = new VisualHarnessRuntime()
  const services = new HarnessRuntime((message) => visual.log(message))
  const removeSignalHandlers = installSignalHandlers(services, () => visual.writeSummary())
  let app: ElectronApplication | undefined

  try {
    await bootstrap(services, visual)

    visual.currentStage = 'launch electron'
    visual.log('launch electron')
    app = await services.watch(services.start(new ElectronApplicationService(electron, visual.uiTimeoutMs)))
    visual.monitorElectron(app)

    const context = await services.watch(createContext(app, services, visual))
    for (const stage of visualStages) {
      await services.watch(visual.runStage(context, stage))
    }

    if (context.consoleErrors.length > 0) {
      visual.log(
        `renderer console errors were observed but did not fail the run: ${context.consoleErrors.length}`
      )
    }

    visual.summary.ok = true
    visual.summary.failedStage = null
    await visual.writeSummary()
    visual.log(`done: ${visual.screenshotDir}`)
  } catch (err) {
    visual.summary.ok = false
    visual.summary.failedStage = visual.currentStage
    if (app) await visual.captureElectronFailureArtifacts(app)
    await visual.writeSummary().catch(() => undefined)
    throw err
  } finally {
    removeSignalHandlers()
    await services.stop()
    await visual.writeSummary().catch(() => undefined)
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  await runVisualHarness()
}
