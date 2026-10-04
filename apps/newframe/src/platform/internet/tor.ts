import { spawn, type ChildProcessByStdio } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createInterface } from 'node:readline'
import type { Readable } from 'node:stream'

import { app, session } from 'electron'
import log from 'electron-log'
import { z } from 'zod'

import type { TorStatus } from './contract/status.ts'
import type { Internet } from './index.ts'

type TorProcess = ChildProcessByStdio<null, Readable, Readable>
type TorLauncher = (
  binary: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; windowsHide: true; stdio: ['ignore', 'pipe', 'pipe'] }
) => TorProcess

export interface RunningTor {
  /** Resolves with the SOCKS port once Tor has fully bootstrapped. */
  ready: Promise<number>
  stop(): Promise<void>
}

/**
 * Runs the bundled Tor client with its own empty config, so neither system Tor
 * settings nor the expert bundle's browser defaults apply. `onExit` reports an
 * unexpected exit after Tor was ready; failures before that reject `ready`.
 */
export function startTor(
  options: { bundle: string; dataDirectory: string; bootstrapTimeoutMs?: number; onExit(error: Error): void },
  launch: TorLauncher = spawn
): RunningTor {
  const binaryDirectory = path.join(options.bundle, 'tor')
  mkdirSync(options.dataDirectory, { recursive: true, mode: 0o700 })
  const torrc = path.join(options.dataDirectory, 'torrc')
  writeFileSync(torrc, '', { mode: 0o600 })
  const tor = launch(
    path.join(binaryDirectory, process.platform === 'win32' ? 'tor.exe' : 'tor'),
    [
      '--defaults-torrc',
      torrc,
      '-f',
      torrc,
      '--DataDirectory',
      options.dataDirectory,
      '--GeoIPFile',
      path.join(options.bundle, 'data', 'geoip'),
      '--GeoIPv6File',
      path.join(options.bundle, 'data', 'geoip6'),
      '--SocksPort',
      '127.0.0.1:auto',
      '--ClientOnly',
      '1',
      '--ClientRejectInternalAddresses',
      '1',
      '--ClientDNSRejectInternalAddresses',
      '1',
      '--SafeLogging',
      '1',
      '--Log',
      'notice stdout',
      // Tor exits on its own if Newframe dies without stopping it.
      '--__OwningControllerProcess',
      String(process.pid)
    ],
    {
      cwd: binaryDirectory,
      // Official Linux bundles keep their shared libraries beside the executable.
      env: { ...process.env, ...(process.platform === 'linux' ? { LD_LIBRARY_PATH: binaryDirectory } : {}) },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    }
  )
  // Drain stderr without keeping anything that might describe requests.
  tor.stderr.resume()
  const lines = createInterface({ input: tor.stdout })
  let stopped: Promise<void> | undefined
  let settled = false

  const stop = () => {
    stopped ??= new Promise<void>((resolve) => {
      if (tor.pid === undefined || tor.exitCode !== null || tor.signalCode !== null) {
        resolve()
        return
      }
      const timer = setTimeout(() => tor.kill('SIGKILL'), 5_000)
      timer.unref()
      tor.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
      tor.kill('SIGTERM')
    })
    return stopped
  }

  const ready = new Promise<number>((resolve, reject) => {
    let socksPort: number | undefined
    let bootstrapped = false
    const timer = setTimeout(
      () => fail(new Error('Tor bootstrap timed out')),
      options.bootstrapTimeoutMs ?? 180_000
    )
    timer.unref()

    function fail(error: Error) {
      if (stopped) {
        return
      }
      if (settled) {
        options.onExit(error)
        return
      }
      settled = true
      clearTimeout(timer)
      reject(error)
      void stop()
    }

    tor.once('error', () => fail(new Error('Bundled Tor could not start')))
    tor.once('exit', (code, signal) => {
      lines.close()
      fail(new Error(`Tor exited (${signal ?? code ?? 'unknown'})`))
    })
    lines.on('line', (line) => {
      const listener = /Opened Socks listener connection \(ready\) on 127\.0\.0\.1:(\d+)/.exec(line)
      if (listener) {
        socksPort = Number(listener[1])
      }
      bootstrapped ||= line.includes('Bootstrapped 100%')
      if (!settled && bootstrapped && socksPort) {
        settled = true
        clearTimeout(timer)
        resolve(socksPort)
      }
    })
  })

  return { ready, stop }
}

function torBundle() {
  // Development reads a bundle fetched by `build/tor-bundle.ts` into build/tor, if any.
  const devBundle = path.resolve(
    import.meta.dirname,
    '../../../../build/tor',
    `${{ darwin: 'mac', win32: 'win' }[process.platform as string] ?? process.platform}-${process.arch}`
  )
  const bundle = app.isPackaged ? path.join(process.resourcesPath, 'tor') : devBundle
  return existsSync(path.join(bundle, 'tor', process.platform === 'win32' ? 'tor.exe' : 'tor'))
    ? bundle
    : undefined
}

/** The packaged default for profiles that never chose: off unless the build set NEWFRAME_TOR_ENABLED. */
function torEnabledByDefault() {
  if (!app.isPackaged) {
    return false
  }
  try {
    const config = readFileSync(path.resolve(import.meta.dirname, '../../../tor-config.json'), 'utf8')
    return z.strictObject({ enabledByDefault: z.boolean() }).parse(JSON.parse(config)).enabledByDefault
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false
    }
    throw error
  }
}

/**
 * Chooses this run's route from the saved preference and, over Tor, starts Tor and
 * holds remote traffic closed until it connects. Remote traffic never falls back to
 * a direct connection: if Tor fails it stays closed until the human turns Tor off.
 */
export function routeInternet(
  internet: Pick<Internet, 'setRoute'>,
  savedPreference: boolean | undefined,
  setStatus: (status: TorStatus) => void
) {
  const bundle = torBundle()
  const enabled = !!bundle && (savedPreference ?? torEnabledByDefault())
  setStatus({ available: !!bundle, connection: enabled ? 'connecting' : 'direct' })
  if (!bundle || !enabled) {
    return
  }
  internet.setRoute({ via: 'tor', socksPort: null })
  const fail = (error: unknown) => {
    log.error('Tor is unavailable', error)
    internet.setRoute({ via: 'tor', socksPort: null })
    setStatus({ available: true, connection: 'error' })
  }
  const tor = startTor({ bundle, dataDirectory: path.join(app.getPath('userData'), 'tor'), onExit: fail })
  app.once('will-quit', () => void tor.stop())
  void tor.ready
    .then(async (socksPort) => {
      // Chromium resolves names through a SOCKS5 proxy, so neither requests nor lookups leave directly.
      await session.defaultSession.setProxy({ proxyRules: `socks5://127.0.0.1:${socksPort}` })
      internet.setRoute({ via: 'tor', socksPort })
      setStatus({ available: true, connection: 'connected' })
    })
    .catch(fail)
}
