import type { ChildProcess } from 'node:child_process'

import type { Electron, ElectronApplication } from 'playwright-core'

import { appDir, electronExecutable, newframeEnv, ports } from '../core/config.ts'
import { ProcessService } from '../core/process-service.ts'
import type { HarnessService } from '../core/service.ts'
import { assertPortFree, sleep } from '../core/utils.ts'

type ElectronLaunchSettings = {
  remoteDebugging?: boolean
}

export function electronLaunchSettings(options: ElectronLaunchSettings = {}) {
  const args = ['./compiled/main']
  if (options.remoteDebugging) args.unshift(`--remote-debugging-port=${ports.cdp}`)

  return {
    args,
    cwd: appDir,
    env: newframeEnv(),
    executablePath: electronExecutable()
  }
}

export function createElectronProcessService() {
  const settings = electronLaunchSettings({ remoteDebugging: true })

  return new ProcessService({
    name: 'Newframe Electron',
    command: settings.executablePath,
    args: settings.args,
    spawn: {
      cwd: settings.cwd,
      env: settings.env,
      stdio: 'inherit'
    },
    beforeStart: async () => {
      await Promise.all([
        assertPortFree(ports.cdp, 'Electron debugging'),
        assertPortFree(ports.newframeRpc, 'Newframe RPC')
      ])
    },
    exitIsFailure: false
  })
}

export class ElectronApplicationService implements HarnessService<ElectronApplication> {
  readonly name = 'Newframe Electron'
  failure?: Promise<never>

  private app?: ElectronApplication
  private readonly launcher: Electron
  private stopping = false
  private readonly timeoutMs: number

  constructor(launcher: Electron, timeoutMs: number) {
    this.launcher = launcher
    this.timeoutMs = timeoutMs
  }

  async start() {
    if (this.app) return this.app

    await assertPortFree(ports.newframeRpc, 'Newframe RPC')

    const settings = electronLaunchSettings()
    const app = await this.launcher.launch({
      ...settings,
      colorScheme: 'no-preference',
      timeout: 15_000
    })
    app.context().setDefaultTimeout(this.timeoutMs)
    app.context().setDefaultNavigationTimeout(this.timeoutMs)
    this.app = app

    this.failure = new Promise<never>((_, reject) => {
      app.once('close', () => {
        if (!this.stopping) reject(new Error('Newframe Electron closed unexpectedly'))
      })
    })
    this.failure.catch(() => undefined)

    return app
  }

  async stop() {
    if (!this.app) return
    this.stopping = true
    const app = this.app
    this.app = undefined
    const child = app.process() as ChildProcess

    await Promise.race([
      app.close().catch(() => undefined),
      sleep(3_000).then(() => {
        if (child.exitCode === null) child.kill('SIGKILL')
      })
    ])
  }
}
