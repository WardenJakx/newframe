import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'

export const rootDir = path.resolve(import.meta.dirname, '../../..')
export const appDir = path.join(rootDir, 'apps/newframe')
export const contractsDir = path.join(rootDir, 'newframe-contracts')

function positiveInteger(value: string | undefined, fallback: number, label: string) {
  const parsed = Number(value || fallback)
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`Invalid ${label}: ${value}`)

  return parsed
}

export const ports = {
  anvil: positiveInteger(
    process.env.NEWFRAME_HARNESS_ANVIL_PORT || process.env.ANVIL_PORT,
    8545,
    'Anvil port'
  ),
  cdp: Number(process.env.NEWFRAME_HARNESS_CDP_PORT || 9333),
  localTrade: Number(process.env.FLASH_LOCAL_TRADE_PORT || 8422),
  newframeRpc: 1248
} as const

export const anvilHost = process.env.NEWFRAME_HARNESS_ANVIL_HOST || process.env.ANVIL_HOST || '127.0.0.1'
export const anvilChainId = positiveInteger(
  process.env.NEWFRAME_HARNESS_ANVIL_CHAIN_ID || process.env.CHAIN_ID,
  31337,
  'Anvil chain ID'
)
export const anvilBlockTimeSeconds = positiveInteger(
  process.env.NEWFRAME_HARNESS_ANVIL_BLOCK_TIME || process.env.ANVIL_BLOCK_TIME,
  1,
  'Anvil block time'
)
export const anvilRpcUrl =
  process.env.NEWFRAME_HARNESS_ANVIL_RPC_URL ||
  process.env.ANVIL_RPC_URL ||
  `http://${anvilHost}:${ports.anvil}`
export const newframeRpcUrl = `http://127.0.0.1:${ports.newframeRpc}`
export const localTradeServiceHealthUrl = `http://127.0.0.1:${ports.localTrade}/health`
export const passwordEnvKeys = ['NEWFRAME_HARNESS_PASSWORD', 'FRAME_HARNESS_PASSWORD'] as const

export function readHarnessPassword() {
  for (const key of passwordEnvKeys) {
    const value = process.env[key]
    if (value) return value
  }

  return ''
}

export function definedEnv(overrides: NodeJS.ProcessEnv = {}): Record<string, string> {
  const inherited = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)
  )
  const definedOverrides = Object.fromEntries(
    Object.entries(overrides).filter((entry): entry is [string, string] => entry[1] !== undefined)
  )
  return {
    ...inherited,
    ...definedOverrides
  }
}

export function newframeEnv(overrides: NodeJS.ProcessEnv = {}): Record<string, string> {
  const env = definedEnv({
    NODE_ENV: 'production',
    FRAME_PROFILE: 'dev',
    ...overrides
  })

  delete env.ELECTRON_RUN_AS_NODE
  for (const key of passwordEnvKeys) delete env[key]

  return env
}

export function electronExecutable() {
  return createRequire(path.join(appDir, 'package.json'))('electron') as string
}
