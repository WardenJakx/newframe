import type { AccountRequest } from '../../../accounts/main/index.js'
import type { ActionType as EnsActions } from './ens.js'
import type { ActionType as Erc20Actions } from './erc20.js'

export type EntityType = 'unknown' | 'contract' | 'external'
export type ActionType = Erc20Actions | EnsActions

export type Action<T> = {
  id: ActionType
  data?: T
  update?: (request: AccountRequest, params: Partial<T>) => void
}

type DecodeContext = {
  account?: Address
}

type DecodeFunction<T> = (calldata: string, context?: DecodeContext) => Action<T> | undefined

export interface DecodableContract<T> {
  name: string
  address: Address
  chainId: number
  decode: DecodeFunction<T>
}
