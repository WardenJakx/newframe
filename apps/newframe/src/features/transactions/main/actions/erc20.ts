import type { Address } from '@newframe/schema/address'
import type { Identity } from '@newframe/schema/request-records'

import type { Action } from './index.ts'

export type ActionType = 'erc20:approve' | 'erc20:revoke' | 'erc20:transfer'

type Erc20Spend = {
  amount: string
  decimals: number
  name: string
  symbol: string
}

type Erc20Approve = Erc20Spend & {
  spender: Identity
  contract: Identity
}

type Erc20Transfer = Erc20Spend & {
  recipient: Identity
  contract: Address
}

export type ApproveAction = Action<Erc20Approve>
export type TransferAction = Action<Erc20Transfer>
