import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import log from 'electron-log'

import type { WalletWorkflowAdapters } from '../../operations/walletWorkflows'
import { getTokenDiscoveryProvider } from '../../portfolio'
import type store from '../../store'
import { openFileDialog } from '../../windows/dialog'
import { createBlockExplorerOpener, openExternal } from '../../windows/window'

async function rpcMatchesChain(url: unknown, chainId: number) {
  if (typeof url !== 'string') return false

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 1, jsonrpc: '2.0', method: 'eth_chainId', params: [] }),
      signal: AbortSignal.timeout(10_000)
    })
    if (!response.ok) return false

    const payload = (await response.json()) as { result?: unknown }
    return (
      typeof payload.result === 'string' &&
      /^0x[0-9a-f]+$/i.test(payload.result) &&
      Number(BigInt(payload.result)) === chainId
    )
  } catch {
    return false
  }
}

export type ProductionWalletWorkflowExternalAdapters = Pick<
  WalletWorkflowAdapters,
  | 'app'
  | 'biometrics'
  | 'clipboard'
  | 'persistence'
  | 'signers'
  | 'trezorBridge'
  | 'updater'
  | 'vault'
  | 'windows'
>

export function createProductionWalletWorkflowAdapters(
  canonicalStore: Pick<typeof store, 'getState'>,
  external: ProductionWalletWorkflowExternalAdapters
): WalletWorkflowAdapters {
  return {
    ...external,
    delay: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    getTokenDiscoveryProvider: () => getTokenDiscoveryProvider(canonicalStore),
    inspectEnabled: process.env.NODE_ENV === 'development',
    log,
    now: Date.now,
    openBlockExplorer: createBlockExplorerOpener(canonicalStore),
    openExternal,
    openFileDialog,
    randomBytes,
    readFile,
    rpcMatchesChain
  }
}
