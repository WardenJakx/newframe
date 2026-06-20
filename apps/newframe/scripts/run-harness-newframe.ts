import { spawn, type ChildProcess, type SpawnOptions } from 'child_process'
import path from 'path'

import { unlockHarnessNewframe } from './unlock-harness-newframe'

const isWindows = process.platform === 'win32'
const SECRET_ENV_KEYS = ['NEWFRAME_HARNESS_PASSWORD', 'FRAME_HARNESS_PASSWORD']

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

async function runUnlock() {
  try {
    await unlockHarnessNewframe({ optional: true })
  } catch (err: any) {
    console.error(`[harness] Auto-unlock failed: ${err.message || String(err)}`)
  }
}

async function run() {
  const frame = launchFrame()

  frame.once('error', (err) => {
    console.error('[harness] Failed to launch Newframe', err)
    process.exit(1)
  })

  runUnlock()

  const forwardSignal = (signal: NodeJS.Signals) => {
    if (!frame.killed) frame.kill(signal)
  }

  process.once('SIGINT', forwardSignal)
  process.once('SIGTERM', forwardSignal)

  frame.once('exit', (code) => {
    process.exit(code ?? 0)
  })
}

if (process.argv[1] && path.basename(process.argv[1]) === 'run-harness-newframe.ts') {
  run()
}
