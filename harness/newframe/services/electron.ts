import type { Electron, ElectronApplication } from 'playwright-core'

import { appDir, electronExecutable, localTradeServiceUrl, newframeEnv, ports } from '../core/config.ts'
import { ProcessService } from '../core/process-service.ts'
import { stopProcess } from '../core/process.ts'
import { trackProcessGroup } from '../core/reaper.ts'
import type { HarnessService } from '../core/service.ts'
import { assertPortFree, sleep } from '../core/utils.ts'

type ElectronLaunchSettings = {
  remoteDebugging?: boolean
  visualHarnessProfile?: string
}

export function electronLaunchSettings(options: ElectronLaunchSettings = {}) {
  const args = ['./compiled/src/main/bootstrap.js']
  if (options.remoteDebugging) {
    args.unshift(`--remote-debugging-port=${ports.cdp}`)
  }

  return {
    args,
    cwd: appDir,
    env: newframeEnv(
      options.visualHarnessProfile
        ? {
            NEWFRAME_VISUAL_HARNESS: 'true',
            NEWFRAME_HARNESS_PROFILE_DIR: options.visualHarnessProfile,
            NEWFRAME_HARNESS_RPC_PORT: String(ports.visualRpc),
            NEWFRAME_FLASH_URL: `${localTradeServiceUrl}/v1`
          }
        : {}
    ),
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
  private readonly profileDirectory: string
  private stopping = false
  private readonly timeoutMs: number

  constructor(launcher: Electron, profileDirectory: string, timeoutMs: number) {
    this.launcher = launcher
    this.profileDirectory = profileDirectory
    this.timeoutMs = timeoutMs
  }

  async start() {
    if (this.app) {
      return this.app
    }

    await assertPortFree(ports.visualRpc, 'Newframe visual RPC')

    const settings = electronLaunchSettings({ visualHarnessProfile: this.profileDirectory })
    const app = await this.launcher.launch({
      ...settings,
      colorScheme: 'no-preference',
      timeout: 30_000
    })
    // Playwright starts Electron as a process group leader; its helpers die with that group.
    trackProcessGroup(app.process())
    app.context().setDefaultTimeout(this.timeoutMs)
    app.context().setDefaultNavigationTimeout(this.timeoutMs)
    this.app = app

    this.failure = new Promise<never>((_, reject) => {
      app.once('close', () => {
        if (!this.stopping) {
          reject(new Error('Newframe Electron closed unexpectedly'))
        }
      })
    })
    this.failure.catch(() => undefined)

    return app
  }

  async stop() {
    if (!this.app) {
      return
    }
    this.stopping = true
    const app = this.app
    this.app = undefined
    const child = app.process()

    await Promise.race([app.close().catch(() => undefined), sleep(3_000)])
    await stopProcess(child, 'SIGKILL')
  }
}
