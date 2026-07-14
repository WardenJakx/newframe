import type { ElectronApplication, Page } from 'playwright-core'

import type { AnvilClient } from './anvil-client.ts'
import type { NewframeDriver } from './driver.ts'
import type { VisualHarnessRuntime } from './runtime.ts'
import type { HarnessRuntime } from '../core/service.ts'

export type HarnessSummary = {
  ok: boolean
  failedStage: string | null
  screenshots: string[]
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
  main?: {
    accounts?: Record<string, AppAccount>
    accountOrder?: string[]
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
  consoleErrors: string[]
}

export type VisualStage = {
  name: string
  run(context: VisualHarnessContext): Promise<void>
}
