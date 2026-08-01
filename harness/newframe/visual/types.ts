import type { ElectronApplication, Page } from 'playwright-core'

import type { AnvilClient } from './anvil-client.ts'
import type { NewframeDriver } from './driver.ts'
import type { VisualHarnessRuntime } from './runtime.ts'
import type { HarnessRuntime } from '../core/service.ts'

export type HarnessSummary = {
  durationMs: number
  evidence: HarnessEvidence[]
  ok: boolean
  failedStage: string | null
  rendererErrors: RendererError[]
  screenshots: string[]
  stages: StageSummary[]
  startedAt: string
}

export type HarnessEvidence = {
  label: string
  stage: string
  value: boolean | number | string | null
}

export type RendererError = {
  allowed: boolean
  allowance?: string
  kind: 'console' | 'crash' | 'pageerror'
  message: string
  pageUrl: string
  source?: string
}

export type StageSummary = {
  durationMs: number
  evidence: HarnessEvidence[]
  name: string
  screenshots: string[]
  status: 'failed' | 'passed' | 'running'
}

export type AccountInfo = {
  id: string
  address: string
  name?: string
  ensName?: string
}

export type AppBalance = {
  address?: string
  chainId?: number | string
  [key: string]: unknown
}

export type AppActivity = {
  account?: string | null
  hash?: string | null
  id?: string
  status?: 'submitted' | 'confirming' | 'succeeded' | 'reverted'
  [key: string]: unknown
}

export type AppNetwork = {
  name?: string
  [key: string]: unknown
}

export type AppOrigin = {
  name?: string
  [key: string]: unknown
}

export type AppPermission = {
  handlerId?: string
  origin?: string
  [key: string]: unknown
}

export type AddChain = {
  explorer?: unknown
  [key: string]: unknown
}

export type AppRequest = {
  approvalGate?:
    | { type: 'gas-fee'; feeUSD: string; currentSymbol: string }
    | {
        type: 'signer-compatibility'
        reason: 'incompatible' | 'no-signer' | 'signer-unavailable'
      }
  chain?: AddChain
  handlerId?: string
  notice?: unknown
  status?: string
  tx?: { hash?: string }
  type?: string
  [key: string]: unknown
}

export type CurrentRequest = AppRequest & {
  accountId: string
  handlerId: string
}

export type AppAccount = AccountInfo & {
  agentEnabled?: boolean
  requests?: Record<string, AppRequest>
}

export type FlashOrder = {
  open?: boolean
  orderId?: string
  orderType?: string
  status?: string
  [key: string]: unknown
}

export type AppState = {
  operations?: Record<
    string,
    {
      operation?: {
        type?: string
        status?: 'pending' | 'succeeded' | 'failed'
        phase?: string
        error?: { code?: string; message?: string }
        entityRefs?: Array<{
          id?: string
          type?: 'account' | 'profile' | 'signer' | 'chain' | 'transaction' | 'request' | 'order' | 'token'
        }>
      }
    }
  >
  main?: {
    accounts?: Record<string, AppAccount>
    accountOrder?: string[]
    activity?: Record<string, AppActivity>
    balances?: Record<string, AppBalance[]>
    currentAccount?: string
    networks?: { ethereum?: Record<string, AppNetwork> }
    orders?: Record<string, FlashOrder>
    origins?: Record<string, AppOrigin>
    permissions?: Record<string, Record<string, AppPermission>>
    showTestnets?: boolean
    signers?: Record<string, unknown>
  }
  windows?: {
    panel?: {
      nav?: Array<{
        view?: string
        data?: {
          accountId?: string
          requestId?: string
        }
      }>
    }
  }
}

export type HarnessAccounts = {
  harness: AccountInfo
  vitalik: AccountInfo
}

export type VisualHarnessContext = {
  anvil: AnvilClient
  app: ElectronApplication
  driver: NewframeDriver
  runtime: VisualHarnessRuntime
  services: HarnessRuntime
  tray: Page
  accounts?: HarnessAccounts
}

export type VisualStage = {
  name: string
  run(context: VisualHarnessContext): Promise<void>
}
