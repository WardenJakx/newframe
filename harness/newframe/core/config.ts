import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'

export const rootDir = path.resolve(import.meta.dirname, '../../..')
export const appDir = path.join(rootDir, 'apps/newframe')
export const contractsDir = path.join(rootDir, 'newframe-contracts')

export const ports = {
  anvil: Number(process.env.NEWFRAME_HARNESS_ANVIL_PORT || 8545),
  cdp: Number(process.env.NEWFRAME_HARNESS_CDP_PORT || 9333),
  localTrade: Number(process.env.FLASH_LOCAL_TRADE_PORT || 8422),
  newframeRpc: 1248
} as const

export const anvilChainId = 31337
export const anvilRpcUrl = `http://127.0.0.1:${ports.anvil}`
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

export function contractsEnv() {
  return definedEnv({
    ANVIL_PORT: String(ports.anvil),
    ANVIL_RPC_URL: anvilRpcUrl,
    CHAIN_ID: String(anvilChainId),
    NEWFRAME_BASE_RPC_URL: newframeRpcUrl,
    NEWFRAME_RPC_URL: `${newframeRpcUrl}?chainId=${anvilChainId}`
  })
}

export function electronExecutable() {
  return createRequire(path.join(appDir, 'package.json'))('electron') as string
}
