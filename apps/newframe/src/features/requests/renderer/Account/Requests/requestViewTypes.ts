import type {
  Eip712Digests,
  Erc7730Display,
  Identity,
  RequestMode,
  RequestStatus,
  TxClassification
} from '../../../contract/requests'
import type { TransactionEffect } from '../../../../transactions/domain'

type RequestRpcPayload = {
  id: string | number
  jsonrpc: '2.0'
  method: string
  _origin?: string
  params: readonly unknown[]
}

type RequestViewBase<TType extends string> = {
  type: TType
  handlerId: string
  origin: string
  account: string
  payload: RequestRpcPayload
  status?: RequestStatus
  mode?: RequestMode
  notice?: string
  created?: number
  id?: string
}

export type RequestItemRequestView = Pick<
  RequestViewBase<string>,
  'created' | 'handlerId' | 'notice' | 'status' | 'type'
>

export type SignRequestView = RequestViewBase<'sign'> & {
  data: { decodedMessage: string }
}

export type TypedDataRequestView = RequestViewBase<'signTypedData'> & {
  typedMessage: { data: unknown; version: string }
  digests?: Partial<Eip712Digests>
  erc7730?: Erc7730Display
}

type PermitMessage = {
  deadline: string | number
  owner: string
  spender: string
  value: string | number
  nonce: string | number
}

export type PermitRequestView = RequestViewBase<'signErc20Permit'> & {
  payload: RequestRpcPayload & {
    params: readonly [unknown, { message: { value: string | number } }, ...unknown[]]
  }
  typedMessage: {
    data: {
      domain: { chainId: number; verifyingContract: string }
      message: PermitMessage
      primaryType: 'Permit'
      types: Record<string, unknown>
    }
    version: string
  }
  permit: PermitMessage & {
    chainId: number
    spender: Identity
    verifyingContract: Identity
  }
  tokenData: { decimals?: number; name: string; symbol: string; totalSupply?: string }
  digests?: Partial<Eip712Digests>
  erc7730?: Erc7730Display
}

export type AccessRequestView = RequestViewBase<'access'>

export type AgentAccessRequestView = RequestViewBase<'agentAccess'> & {
  data: {
    descriptor: { name: string; description?: string; url?: string }
    durationSeconds: number
  }
}

export type ChainRequestView = RequestViewBase<'addChain' | 'switchChain'> & {
  chain: { id: string | number; type: string; name?: string }
}

export type AddTokenRequestView = RequestViewBase<'addToken'> & {
  token: { address: string; chainId: number; decimals: number; name: string; symbol: string }
}

type TransactionParamView = {
  chainId: string
  data?: string
}

export type TransactionDataView = {
  chainId: string
  type: string
  gasFeesSource: 'Dapp' | 'Frame'
  gasLimit?: string
  maxPriorityFeePerGas?: string
  maxFeePerGas?: string
  gasPrice?: string
  to?: string
  from?: string
  data?: string
  value?: string
  calldataDigest?: string
}

export type TransactionRequestView = RequestViewBase<'transaction'> & {
  payload: RequestRpcPayload & {
    method: 'eth_sendTransaction'
    params: readonly [TransactionParamView, ...unknown[]]
  }
  data: TransactionDataView
  decodedData?: {
    method: string
    signature: string
    args: Array<{ value: string }>
  }
  tokenData?: { decimals?: number; name: string; symbol: string }
  chainData?: { optimism?: { l1Fees: string } }
  simulation?: {
    status: 'loading' | 'success' | 'unavailable' | 'error'
    effects?: TransactionEffect[]
  }
  tx?: {
    receipt?: { gasUsed: string; effectiveGasPrice?: string }
    hash?: string
  }
  recognizedActions?: Array<{ id: string; data?: unknown }>
  feesUpdatedByUser?: boolean
  recipient?: string
  recipientType?: string
  classification?: TxClassification
}

export type AdjustFeeRequestView = Pick<TransactionRequestView, 'data' | 'handlerId'>

export type RenderableRequestView =
  | AccessRequestView
  | AddTokenRequestView
  | AgentAccessRequestView
  | ChainRequestView
  | PermitRequestView
  | SignRequestView
  | TransactionRequestView
  | TypedDataRequestView
