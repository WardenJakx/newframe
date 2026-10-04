import { freePort } from './core/utils.ts'

// Free ports are chosen before the harness config loads, so concurrent runs and a running
// `bun run dev` never share Anvil, the local services, or the app's RPC endpoint.
const anvilPort = await freePort()
process.env.NEWFRAME_HARNESS_ANVIL_PORT = String(anvilPort)
process.env.NEWFRAME_HARNESS_ANVIL_RPC_URL = `http://127.0.0.1:${anvilPort}`
process.env.FLASH_LOCAL_TRADE_PORT = String(await freePort())
process.env.NEWFRAME_LOCAL_SAFE_PORT = String(await freePort())
process.env.NEWFRAME_HARNESS_RPC_PORT = String(await freePort())

const { runVisualHarness } = await import('./visual-harness.ts')
await runVisualHarness()
