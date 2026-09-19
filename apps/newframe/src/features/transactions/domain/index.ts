import type { JSONTx } from '@ethereumjs/tx'
import { addHexPrefix, isHexString } from '@ethereumjs/util'

import { MAX_HEX } from './constants.js'
import { typeSupportsBaseFee } from './fees.js'

export { limitTransactionFee, type TransactionFeeField, typeSupportsBaseFee } from './fees.js'

export enum GasFeesSource {
  Dapp = 'Dapp',
  Frame = 'Frame'
}

export const TRANSACTION_CONFIRMATION_TARGET = 3

// ethereumjs v10 types JSONTx fields as `0x${string}` templates; Newframe passes
// plain (but 0x-prefixed at runtime) strings throughout, so widen them here and
// narrow again at the createTx boundary
type WidenHexFields<T> = {
  [K in keyof T]: NonNullable<T[K]> extends `0x${string}`
    ? undefined extends T[K]
      ? string | undefined
      : string
    : T[K]
}

export interface TransactionData extends Omit<WidenHexFields<JSONTx>, 'chainId' | 'type'> {
  warning?: string
  gas?: string
  from?: string
  feesUpdated?: boolean
  calldataDigest?: string
  chainId: string
  type: string
  gasFeesSource: GasFeesSource
  recipientType?: string
}

export function usesBaseFee(rawTx: TransactionData) {
  return typeSupportsBaseFee(rawTx.type)
}

type TransactionEffectDirection = 'out' | 'in' | 'neutral'
type TransactionEffectKind = 'native' | 'erc20' | 'allowance'

export interface TransactionEffect {
  id: string
  kind: TransactionEffectKind
  direction: TransactionEffectDirection
  label: string
  amount?: string
  decimals?: number
  symbol: string
  detail?: string
  assetAddress?: string
  spenderAddress?: string
  logoURI?: string
}

export interface TransactionPositionToken {
  address: string
  chainId: number
  decimals: number
  logoURI?: string
  name: string
  symbol: string
}

type TransactionSimulationStatus = 'loading' | 'success' | 'unavailable' | 'error'

export interface TransactionSimulation {
  status: TransactionSimulationStatus
  effects?: TransactionEffect[]
  effectsByAccount?: Record<string, TransactionEffect[]>
  effectsProfileId?: string
  source?: string
  error?: string
  updatedAt?: number
}

export interface TransactionIntent {
  title: string
  subtitle: string
}

type TransactionScalar = string | number | bigint | null

export interface TransactionAnalysisInput {
  chainId?: string | number | null
  classification?: string
  data?: unknown
  decodedData?: unknown
  payload?: unknown
  recognizedActions?: readonly unknown[]
  simulation?: TransactionSimulation
  tokenData?: unknown
  tx?: unknown
}

const recordValue = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined

const stringValue = (value: unknown) => (typeof value === 'string' ? value : undefined)

const scalarValue = (value: unknown): TransactionScalar | undefined =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint' || value === null
    ? value
    : undefined

const requestData = (req: TransactionAnalysisInput) => recordValue(req.data)
const tokenData = (req: TransactionAnalysisInput) => recordValue(req.tokenData)
const recognizedActions = (req: TransactionAnalysisInput) =>
  (req.recognizedActions ?? []).map(recordValue).filter((action) => action !== undefined)
const actionData = (action: Record<string, unknown>) => recordValue(action.data)

function safeBigInt(value?: TransactionScalar) {
  if (value === undefined || value === null || value === '') {
    return 0n
  }

  try {
    return BigInt(value)
  } catch {
    return 0n
  }
}

function shortAddress(address?: string) {
  if (!address) {
    return ''
  }
  return `${address.slice(0, 8)}...${address.slice(-6)}`
}

function firstRecognizedAction(req: TransactionAnalysisInput) {
  return recognizedActions(req)[0]
}

function isUnlimitedApproval(amount?: string) {
  return amount?.toLowerCase?.() === MAX_HEX.toLowerCase()
}

function decodedArg(req: TransactionAnalysisInput, index: number) {
  const args = recordValue(req.decodedData)?.args
  return Array.isArray(args) ? stringValue(recordValue(args[index])?.value) : undefined
}

function hasRecognizedErc20Action(req: TransactionAnalysisInput) {
  return recognizedActions(req).some((action) =>
    ['erc20:transfer', 'erc20:approve', 'erc20:revoke'].includes(stringValue(action.id) ?? '')
  )
}

function isDecodedErc20Approve(req: TransactionAnalysisInput) {
  const decodedData = recordValue(req.decodedData)
  return (
    !hasRecognizedErc20Action(req) &&
    decodedData?.signature === 'approve(address,uint256)' &&
    decodedData.method === 'approve'
  )
}

function isDecodedErc20Transfer(req: TransactionAnalysisInput) {
  const decodedData = recordValue(req.decodedData)
  return (
    !hasRecognizedErc20Action(req) &&
    decodedData?.signature === 'transfer(address,uint256)' &&
    decodedData.method === 'transfer'
  )
}

export function getTransactionIntent(req: TransactionAnalysisInput, nativeSymbol = 'ETH'): TransactionIntent {
  const action = firstRecognizedAction(req)
  const data = action ? actionData(action) : undefined
  const [, actionType] = (stringValue(action?.id) ?? '').split(':')
  const token = tokenData(req)

  if (action?.id === 'erc20:transfer') {
    return {
      title: `Send ${stringValue(data?.symbol) ?? stringValue(token?.symbol) ?? 'token'}`,
      subtitle: stringValue(data?.name) ?? stringValue(token?.name) ?? 'Token transfer'
    }
  }

  if (action?.id === 'erc20:approve' || action?.id === 'erc20:revoke') {
    const symbol = stringValue(data?.symbol) ?? stringValue(token?.symbol) ?? 'token'
    const revoke = action.id === 'erc20:revoke' || safeBigInt(scalarValue(data?.amount)) === 0n

    return {
      title: revoke ? `Revoke ${symbol} allowance` : `Approve ${symbol}`,
      subtitle: 'Allowance change'
    }
  }

  if (isDecodedErc20Approve(req)) {
    const amount = decodedArg(req, 1)
    const revoke = safeBigInt(amount) === 0n
    return {
      title: revoke
        ? `Revoke ${stringValue(token?.symbol) ?? 'token'} allowance`
        : `Approve ${stringValue(token?.symbol) ?? 'token'}`,
      subtitle: stringValue(token?.name) ?? 'Allowance change'
    }
  }

  if (isDecodedErc20Transfer(req)) {
    return {
      title: `Send ${stringValue(token?.symbol) ?? 'token'}`,
      subtitle: stringValue(token?.name) ?? 'Token transfer'
    }
  }

  if (actionType) {
    return {
      title: actionType,
      subtitle: 'Recognized action'
    }
  }

  switch (req?.classification) {
    case 'CONTRACT_DEPLOY':
      return { title: 'Deploy contract', subtitle: 'Contract creation' }
    case 'CONTRACT_CALL':
      return {
        title: stringValue(recordValue(req.decodedData)?.method) ?? 'Call contract',
        subtitle: stringValue(recordValue(req.decodedData)?.contractName) ?? 'Contract interaction'
      }
    case 'SEND_DATA':
      return { title: 'Send data', subtitle: 'Data transaction' }
    case 'NATIVE_TRANSFER':
      return { title: `Send ${nativeSymbol}`, subtitle: 'Native transfer' }
    case undefined:
      return { title: 'Review transaction', subtitle: 'Transaction request' }
    default:
      return { title: 'Review transaction', subtitle: 'Transaction request' }
  }
}

function getDeterministicTransactionEffects(
  req: TransactionAnalysisInput,
  nativeSymbol = 'ETH'
): TransactionEffect[] {
  const effects: TransactionEffect[] = []
  const data = requestData(req)
  const dataTo = stringValue(data?.to)
  const payload = recordValue(req.payload)
  const params = Array.isArray(payload?.params) ? payload.params : []
  const nativeValue = stringValue(data?.value) ?? stringValue(recordValue(params[0])?.value)

  if (safeBigInt(nativeValue) > 0n) {
    effects.push({
      id: 'native-value-out',
      kind: 'native',
      direction: 'out',
      label: 'Asset out',
      ...(nativeValue ? { amount: nativeValue } : {}),
      decimals: 18,
      symbol: nativeSymbol,
      detail: 'Transaction value'
    })
  }

  recognizedActions(req).forEach((action, index) => {
    const actionDetails = actionData(action)
    if (action.id === 'erc20:transfer') {
      const amount = stringValue(actionDetails?.amount)
      const recipient = recordValue(actionDetails?.recipient)
      const token = tokenData(req)
      let decimals: number | undefined
      if (typeof token?.decimals === 'number') {
        decimals = token.decimals
      } else if (typeof actionDetails?.decimals === 'number') {
        decimals = actionDetails.decimals
      }
      const symbol = stringValue(actionDetails?.symbol) ?? stringValue(token?.symbol) ?? 'Token'
      const contract = recordValue(actionDetails?.contract)
      const contractAddress =
        stringValue(contract?.address) ?? stringValue(actionDetails?.contract) ?? stringValue(data?.to)
      const logoURI = stringValue(actionDetails?.logoURI)

      effects.push({
        id: `erc20-transfer-${index}`,
        kind: 'erc20',
        direction: 'out',
        label: 'Asset out',
        ...(amount ? { amount } : {}),
        ...(decimals !== undefined ? { decimals } : {}),
        symbol,
        detail: stringValue(recipient?.ens) ?? shortAddress(stringValue(recipient?.address)),
        ...(contractAddress ? { assetAddress: contractAddress } : {}),
        ...(logoURI ? { logoURI } : {})
      })
    }

    if (action.id === 'erc20:approve' || action.id === 'erc20:revoke') {
      const amount = stringValue(actionDetails?.amount)
      const spender = recordValue(actionDetails?.spender)
      const token = tokenData(req)
      let decimals: number | undefined
      if (typeof token?.decimals === 'number') {
        decimals = token.decimals
      } else if (typeof actionDetails?.decimals === 'number') {
        decimals = actionDetails.decimals
      }
      const symbol = stringValue(actionDetails?.symbol) ?? stringValue(token?.symbol) ?? 'Token'
      const revoke = action.id === 'erc20:revoke' || safeBigInt(amount) === 0n
      const contract = recordValue(actionDetails?.contract)
      const contractAddress =
        stringValue(contract?.address) ?? stringValue(actionDetails?.contract) ?? stringValue(data?.to)
      const spenderAddress = stringValue(spender?.address)
      const logoURI = stringValue(actionDetails?.logoURI)

      effects.push({
        id: `erc20-approval-${index}`,
        kind: 'allowance',
        direction: 'neutral',
        label: revoke ? 'Allowance revoked' : 'Allowance change',
        ...(amount ? { amount } : {}),
        ...(decimals !== undefined ? { decimals } : {}),
        symbol,
        detail: `${revoke ? 'For' : 'For spender'} ${stringValue(spender?.ens) ?? shortAddress(spenderAddress)}${
          isUnlimitedApproval(amount) ? ' (unlimited)' : ''
        }`,
        ...(contractAddress ? { assetAddress: contractAddress } : {}),
        ...(spenderAddress ? { spenderAddress } : {}),
        ...(logoURI ? { logoURI } : {})
      })
    }
  })

  if (isDecodedErc20Approve(req)) {
    const spender = decodedArg(req, 0)
    const amount = decodedArg(req, 1)
    const revoke = safeBigInt(amount) === 0n
    const token = tokenData(req)

    effects.push({
      id: 'decoded-erc20-approval',
      kind: 'allowance',
      direction: 'neutral',
      label: revoke ? 'Allowance revoked' : 'Allowance change',
      amount: addHexPrefix(safeBigInt(amount).toString(16)),
      symbol: stringValue(token?.symbol) ?? 'Token',
      detail: `${revoke ? 'For' : 'For spender'} ${shortAddress(spender)}`,
      ...(dataTo ? { assetAddress: dataTo } : {}),
      ...(spender ? { spenderAddress: spender } : {}),
      ...(typeof token?.decimals === 'number' && Number.isInteger(token.decimals)
        ? { decimals: token.decimals }
        : {})
    })
  }

  if (isDecodedErc20Transfer(req)) {
    const recipient = decodedArg(req, 0)
    const amount = decodedArg(req, 1)
    const token = tokenData(req)

    effects.push({
      id: 'decoded-erc20-transfer',
      kind: 'erc20',
      direction: 'out',
      label: 'Asset out',
      amount: addHexPrefix(safeBigInt(amount).toString(16)),
      symbol: stringValue(token?.symbol) ?? 'Token',
      detail: shortAddress(recipient),
      ...(dataTo ? { assetAddress: dataTo } : {}),
      ...(typeof token?.decimals === 'number' && Number.isInteger(token.decimals)
        ? { decimals: token.decimals }
        : {})
    })
  }

  return effects
}

export function getTransactionEffects(
  req: TransactionAnalysisInput,
  nativeSymbol = 'ETH'
): TransactionEffect[] {
  const deterministicEffects = getDeterministicTransactionEffects(req, nativeSymbol)
  const simulatedEffects =
    req?.simulation?.status === 'success' && Array.isArray(req.simulation.effects)
      ? req.simulation.effects
      : []

  if (!simulatedEffects.length) {
    return deterministicEffects
  }

  const simulatedWithMetadata = simulatedEffects.map((simulated: TransactionEffect) => {
    if (simulated.kind !== 'erc20') {
      return simulated
    }

    const address = (simulated.assetAddress ?? '').toLowerCase()
    const deterministic = deterministicEffects.find(
      (effect) =>
        effect.kind === 'erc20' && !!address && (effect.assetAddress ?? '').toLowerCase() === address
    )
    if (!deterministic) {
      return simulated
    }

    const genericMetadata = !simulated.symbol || simulated.symbol === 'Token'
    return {
      ...simulated,
      ...((genericMetadata || !Number.isInteger(simulated.decimals)) &&
      Number.isInteger(deterministic.decimals)
        ? { decimals: deterministic.decimals }
        : {}),
      ...(genericMetadata && deterministic.symbol ? { symbol: deterministic.symbol } : {}),
      ...(!simulated.logoURI && deterministic.logoURI ? { logoURI: deterministic.logoURI } : {})
    }
  })
  const deterministicNeutralEffects = deterministicEffects.filter(
    (effect) =>
      effect.direction === 'neutral' &&
      !simulatedEffects.some(
        (simulated: TransactionEffect) =>
          effect.kind === 'allowance' &&
          simulated.kind === 'allowance' &&
          !!effect.assetAddress &&
          !!effect.spenderAddress &&
          effect.assetAddress.toLowerCase() === simulated.assetAddress?.toLowerCase() &&
          effect.spenderAddress.toLowerCase() === simulated.spenderAddress?.toLowerCase()
      )
  )

  return [...simulatedWithMetadata, ...deterministicNeutralEffects]
}

export function getTransactionPositionTokens(req: TransactionAnalysisInput): TransactionPositionToken[] {
  const dataChainId = requestData(req)?.chainId
  const chainIdValue =
    typeof dataChainId === 'string' || typeof dataChainId === 'number' || dataChainId === null
      ? dataChainId
      : req.chainId
  const chainId = parseChainId(chainIdValue)
  if (!Number.isInteger(chainId) || chainId <= 0) {
    return []
  }

  const tokens = new Map<string, TransactionPositionToken>()

  getTransactionEffects(req).forEach((effect) => {
    const address = (effect.assetAddress ?? '').trim().toLowerCase()
    if (effect.kind !== 'erc20' || effect.direction === 'neutral') {
      return
    }
    if (!/^0x[0-9a-f]{40}$/.test(address)) {
      return
    }

    const symbol = effect.symbol || 'Token'
    if (!Number.isInteger(effect.decimals)) {
      return
    }
    const decimals = Number(effect.decimals)
    const token = {
      address,
      chainId,
      decimals,
      name: symbol,
      symbol,
      ...(effect.logoURI ? { logoURI: effect.logoURI } : {})
    }

    tokens.set(`${chainId}:${address}`, token)
  })

  return [...tokens.values()]
}

export function getPaidTransactionFee(req: TransactionAnalysisInput) {
  const receipt = recordValue(recordValue(req.tx)?.receipt)
  if (!receipt) {
    return undefined
  }

  const gasUsed = safeBigInt(scalarValue(receipt.gasUsed))
  const paidGas = scalarValue(receipt.effectiveGasPrice) ?? scalarValue(requestData(req)?.gasPrice)
  const gasPrice = safeBigInt(paidGas)

  if (!gasUsed || !gasPrice) {
    return undefined
  }

  return addHexPrefix((gasUsed * gasPrice).toString(16))
}

function parseChainId(chainId: string | number | null | undefined) {
  if (chainId === undefined || chainId === null) {
    return Number.NaN
  }
  if (typeof chainId === 'number') {
    return chainId
  }
  if (isHexString(chainId)) {
    return parseInt(chainId, 16)
  }

  return Number(chainId)
}

// TODO: move this into requests parsing module
export function normalizeChainId(tx: RPC.SendTransaction.TxParams, targetChain?: number) {
  if (!tx.chainId) {
    return tx
  }

  const chainId = parseChainId(tx.chainId)

  if (!chainId) {
    throw new Error(`Chain for transaction (${tx.chainId}) is not a hex-prefixed string`)
  }

  if (targetChain && targetChain !== chainId) {
    throw new Error(
      `Chain for transaction (${tx.chainId}) does not match request target chain (${targetChain})`
    )
  }

  return {
    ...tx,
    chainId: addHexPrefix(chainId.toString(16))
  }
}
