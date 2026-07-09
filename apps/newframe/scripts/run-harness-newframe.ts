import { spawn, type ChildProcess, type SpawnOptions } from 'child_process'
import path from 'path'

import { unlockHarnessNewframe } from './unlock-harness-newframe'

const isWindows = process.platform === 'win32'
const SECRET_ENV_KEYS = ['NEWFRAME_HARNESS_PASSWORD', 'FRAME_HARNESS_PASSWORD']
const LOCAL_TRADE_SERVICE_URL = 'http://127.0.0.1:8422/health'

function electronBin() {
  return path.join('node_modules', '.bin', isWindows ? 'electron.cmd' : 'electron')
}

function newframeEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'production' as NodeJS.ProcessEnv['NODE_ENV'],
    FRAME_PROFILE: 'dev'
  }

  for (const key of SECRET_ENV_KEYS) delete env[key]

  return env
}

function launchFrame(): ChildProcess {
  const options: SpawnOptions = {
    env: newframeEnv(),
    shell: isWindows,
    stdio: 'inherit'
  }

  return spawn(electronBin(), ['--remote-debugging-port=9333', './compiled/main'], options)
}

function launchLocalTradeService(): ChildProcess {
  return spawn('bun', ['./scripts/local-trade-service.ts'], {
    env: process.env,
    shell: isWindows,
    stdio: 'inherit'
  })
}

async function waitForLocalTradeService(timeoutMs = 10_000) {
  const started = Date.now()
  let lastError: unknown

  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(LOCAL_TRADE_SERVICE_URL)
      if (response.ok) return
    } catch (err) {
      lastError = err
    }

    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  throw new Error(
    `Timed out waiting for local trade service at ${LOCAL_TRADE_SERVICE_URL}${
      lastError instanceof Error ? `: ${lastError.message}` : ''
    }`
  )
}

function stopProcess(child: ChildProcess | undefined, signal: NodeJS.Signals = 'SIGTERM') {
  if (child && !child.killed && child.exitCode === null) child.kill(signal)
}

async function runUnlock() {
  try {
    await unlockHarnessNewframe({ optional: true })
  } catch (err: any) {
    console.error(`[harness] Auto-unlock failed: ${err.message || String(err)}`)
  }
}

async function run() {
  const localTradeService = launchLocalTradeService()

  localTradeService.once('error', (err) => {
    console.error('[harness] Failed to launch local trade service', err)
    process.exit(1)
  })

  await waitForLocalTradeService()

  const frame = launchFrame()

  frame.once('error', (err) => {
    console.error('[harness] Failed to launch Newframe', err)
    process.exit(1)
  })

  runUnlock()

  const forwardSignal = (signal: NodeJS.Signals) => {
    stopProcess(localTradeService, signal)
    stopProcess(frame, signal)
  }

  process.once('SIGINT', forwardSignal)
  process.once('SIGTERM', forwardSignal)

  frame.once('exit', (code) => {
    stopProcess(localTradeService)
    process.exit(code ?? 0)
  })
}

if (process.argv[1] && path.basename(process.argv[1]) === 'run-harness-newframe.ts') {
  run()
}
