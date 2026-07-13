import path from 'node:path'

import { unlockHarnessNewframe } from '../../apps/newframe/scripts/unlock-harness-newframe.ts'

import { HarnessRuntime, installSignalHandlers } from './core/service.ts'
import { createAnvilService } from './services/anvil.ts'
import { createSeedAnvilService } from './services/contracts.ts'
import { createElectronProcessService } from './services/electron.ts'
import { createLocalTradeService } from './services/local-trade.ts'

const log = (message: string) => console.log(`[harness] ${message}`)

async function runUnlock() {
  try {
    await unlockHarnessNewframe({ optional: true })
  } catch (err) {
    console.error(`[harness] Auto-unlock failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}

export async function runLiveHarness() {
  const runtime = new HarnessRuntime(log)
  const removeSignalHandlers = installSignalHandlers(runtime)

  try {
    await runtime.start(createAnvilService())
    const seed = await runtime.start(createSeedAnvilService())
    await runtime.watch(seed.completed)
    await runtime.start(createLocalTradeService({ stdio: 'inherit' }))
    const frame = await runtime.watch(runtime.start(createElectronProcessService()))
    void runUnlock()

    return await runtime.watch(frame.exited)
  } finally {
    removeSignalHandlers()
    await runtime.stop()
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  process.exitCode = await runLiveHarness()
}
