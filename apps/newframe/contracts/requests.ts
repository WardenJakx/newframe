import type {
  MessageTypes,
  SignTypedDataVersion,
  TypedDataV1,
  TypedMessage as BaseTypedMessage
} from '@metamask/eth-sig-util'
import type { Token } from '../domain/state/token.js'
import type { TransactionData, TransactionSimulation } from '../domain/transaction/index.js'

export interface DecodedCallData {
  contractAddress: string
  contractName: string
  source: string
  selector: string
  signature: string
  method: string
  args: Array<{
    name: string
    type: string
    value: string
  }>
}

export interface TokenData {
  decimals?: number
  name: string
  symbol: string
  totalSupply?: string
}

export interface Eip712Digests {
  eip712Digest: string
  domainHash: string
  messageHash: string
}

export interface Erc7730Display {
  title: string
  summary?: string
  descriptorPath?: string
  rows: Array<{
    label: string
    value: string
    path?: string
    format?: string
  }>
}

export type Action<T> = {
  id: string
  data?: T
  update?: (request: AccountRequest, params: Partial<T>) => void
}

export type ChainRequestData = {
  id: number
  type: string
  name: string
  symbol?: string
  explorer?: string
  primaryRpc?: string
  secondaryRpc?: string
  nativeCurrencyName?: string
}

export enum ReplacementType {
  Speed = 'speed',
  Cancel = 'cancel'
}

export enum RequestMode {
  Normal = 'normal',
  Monitor = 'monitor'
}

export enum RequestStatus {
  Pending = 'pending',
  Sending = 'sending',
  Verifying = 'verifying',
  Confirming = 'confirming',
  Confirmed = 'confirmed',
  Sent = 'sent',
  Declined = 'declined',
  Error = 'error',
  Success = 'success'
}

export type TypedSignatureRequestType = 'signTypedData' | 'signErc20Permit'

type SignatureRequestType = 'sign' | TypedSignatureRequestType

export type RequestType =
  | SignatureRequestType
  | 'transaction'
  | 'agentAccess'
  | 'access'
  | 'addChain'
  | 'switchChain'
  | 'addToken'

interface Request {
  type: RequestType
  handlerId: string
}

export type RequestPrincipal =
  | {
      kind: 'renderer'
      role: 'wallet-ui' | 'sidetray'
      entrypoint: 'tray' | 'sidetray'
      webContentsId: number
      windowInstanceId: string
    }
  | {
      kind: 'rpc'
      transport: 'http' | 'websocket'
      connectionId: string
      origin: string
    }
  | {
      kind: 'agent'
      sessionId: string
      accountId: string
      expiresAt: number
    }
  | { kind: 'main'; component: string }

export type RequestAuthorization = {
  actionId: string
  decision: 'prompt' | 'autonomous'
  decidedAt: number
  principal: RequestPrincipal
  intent: {
    requestType: RequestType
    account: string
    method: string
  }
}

export type RequestApprovalGate =
  | {
      type: 'signer-compatibility'
      reason: 'incompatible'
      signer: string
      tx: string
      chain: { type: 'ethereum'; id: number }
    }
  | {
      type: 'signer-compatibility'
      reason: 'no-signer'
    }
  | {
      type: 'signer-compatibility'
      reason: 'signer-unavailable'
      signerIds: string[]
    }
  | {
      type: 'gas-fee'
      feeUSD: string
      currentSymbol: string
    }

export type Identity = {
  address: Address
  ens: string
  type: string
}

export interface AccountRequest<T extends RequestType = RequestType> extends Request {
  type: T
  origin: string
  payload: JSONRPCRequestPayload
  account: string
  status?: RequestStatus
  mode?: RequestMode
  notice?: string
  created?: number
  /** Serializable record of the central authority decision for production requests. */
  authorization?: RequestAuthorization
  /** Safe, projected main-owned confirmation gate for the next approval step. */
  approvalGate?: RequestApprovalGate
}

export interface TransactionReceipt {
  gasUsed: string
  blockNumber: string
}

export interface Approval {
  type: string
  data: any
  approved: boolean
}

export type CanonicalAccountRequest = AccountRequest & {
  approvals?: Approval[]
  recognizedActions?: Array<Omit<Action<unknown>, 'update'>>
}

interface Permit {
  deadline: string | number
  spender: string
  value: string | number
  owner: string
  verifyingContract: string
  chainId: number
  nonce: string | number
}

export enum TxClassification {
  CONTRACT_DEPLOY = 'CONTRACT_DEPLOY',
  CONTRACT_CALL = 'CONTRACT_CALL',
  SEND_DATA = 'SEND_DATA',
  NATIVE_TRANSFER = 'NATIVE_TRANSFER'
}

export interface TransactionRequest extends AccountRequest<'transaction'> {
  payload: RPC.SendTransaction.Request
  data: TransactionData
  decodedData?: DecodedCallData
  tokenData?: TokenData
  chainData?: {
    optimism?: {
      l1Fees: string
    }
  }
  simulation?: TransactionSimulation
  tx?: {
    receipt?: TransactionReceipt
    hash?: string
    confirmations: number
  }
  approvals: Approval[]
  locked?: boolean
  automaticFeeUpdateNotice?: {
    previousFee: any
  }
  recipient?: string // resolved name
  updatedFees?: boolean
  feeAtTime?: string
  completed?: number
  feesUpdatedByUser: boolean
  recipientType: string
  recognizedActions: Action<unknown>[]
  classification: TxClassification
}

interface SignRequest extends AccountRequest<'sign'> {
  data: {
    decodedMessage: string
  }
}

export type TypedData<T extends MessageTypes = MessageTypes> = BaseTypedMessage<T>
export type LegacyTypedData = TypedDataV1

export interface TypedMessage<V extends SignTypedDataVersion = SignTypedDataVersion> {
  data: V extends SignTypedDataVersion.V1 ? LegacyTypedData : TypedData
  version: V
}

export type SignTypedDataRequest = DefaultSignTypedDataRequest | PermitSignatureRequest

export type SignatureRequest = SignTypedDataRequest | SignRequest

interface DefaultSignTypedDataRequest extends AccountRequest<'signTypedData'> {
  typedMessage: TypedMessage
  digests?: Eip712Digests
  erc7730?: Erc7730Display
}

interface EIP2612PermitDomain {
  chainId: number
  verifyingContract: string
}

export interface EIP2612TypedData {
  types: MessageTypes
  primaryType: 'Permit'
  domain: EIP2612PermitDomain
  message: Omit<Permit, 'chainId' | 'verifyingContract'>
}

interface PermitData extends Omit<Permit, 'spender' | 'verifyingContract'> {
  spender: Identity
  verifyingContract: Identity
}

export interface PermitSignatureRequest extends AccountRequest<'signErc20Permit'> {
  typedMessage: {
    data: EIP2612TypedData
    version: SignTypedDataVersion
  }
  digests?: Eip712Digests
  erc7730?: Erc7730Display
  permit: PermitData
  tokenData: TokenData
}

export type AccessRequest = AccountRequest<'access'>

export interface AgentAccessRequest extends AccountRequest<'agentAccess'> {
  data: {
    descriptor: {
      name: string
      description?: string
      url?: string
    }
    durationSeconds: number
  }
}

export interface AddChainRequest extends AccountRequest<'addChain'> {
  chain: ChainRequestData
}

export interface AddTokenRequest extends AccountRequest<'addToken'> {
  token: Token
}
