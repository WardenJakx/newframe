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

interface RecognizedActionData {
  amount?: string
  contract?: string | { address?: string }
  decimals?: number
  logoURI?: string
  name?: string
  recipient?: { address?: string; ens?: string }
  spender?: { address?: string; ens?: string }
  symbol?: string
}

interface RecognizedAction {
  id?: string
  data?: unknown
}

interface TransactionSummaryInput {
  chainId?: string | number | null
  classification?: string
  data?: {
    chainId?: string
    gasPrice?: string
    to?: string
    value?: string
  }
  decodedData?: {
    args?: Array<{ value?: string }>
    contractName?: string
    method?: string
    signature?: string
  }
  payload?: unknown
  recognizedActions?: RecognizedAction[]
  simulation?: TransactionSimulation
  tokenData?: {
    decimals?: number
    name?: string
    symbol?: string
  }
  tx?: {
    receipt?: unknown
  }
}

function safeBigInt(value?: string | number | bigint | null) {
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

function firstRecognizedAction(req: TransactionSummaryInput) {
  return (req.recognizedActions ?? [])[0]
}

function recognizedActionData(action?: RecognizedAction): RecognizedActionData {
  return action?.data && typeof action.data === 'object' && !Array.isArray(action.data) ? action.data : {}
}

function contractAddress(contract: RecognizedActionData['contract']) {
  return typeof contract === 'string' ? contract : contract?.address
}

function isUnlimitedApproval(amount?: string) {
  return amount?.toLowerCase() === MAX_HEX.toLowerCase()
}

function erc20TokenData(req: TransactionSummaryInput) {
  return req.tokenData
}

function decodedArg(req: TransactionSummaryInput, index: number) {
  return req.decodedData?.args?.[index]?.value
}

function payloadValue(payload: unknown) {
  if (!payload || typeof payload !== 'object' || !('params' in payload) || !Array.isArray(payload.params)) {
    return undefined
  }
  const params: unknown[] = payload.params
  const first = params[0]
  if (!first || typeof first !== 'object') {
    return undefined
  }
  const record = first as Record<string, unknown>
  return typeof record.value === 'string' ? record.value : undefined
}

function hasRecognizedErc20Action(req: TransactionSummaryInput) {
  return (req.recognizedActions ?? []).some((action) =>
    ['erc20:transfer', 'erc20:approve', 'erc20:revoke'].includes(action.id ?? '')
  )
}

function isDecodedErc20Approve(req: TransactionSummaryInput) {
  return (
    !hasRecognizedErc20Action(req) &&
    req.decodedData?.signature === 'approve(address,uint256)' &&
    req.decodedData.method === 'approve'
  )
}

function isDecodedErc20Transfer(req: TransactionSummaryInput) {
  return (
    !hasRecognizedErc20Action(req) &&
    req.decodedData?.signature === 'transfer(address,uint256)' &&
    req.decodedData.method === 'transfer'
  )
}

export function getTransactionIntent(req: TransactionSummaryInput, nativeSymbol = 'ETH'): TransactionIntent {
  const action = firstRecognizedAction(req)
  const actionData = recognizedActionData(action)
  const [, actionType] = (action?.id ?? '').split(':')
  const token = erc20TokenData(req)

  if (action?.id === 'erc20:transfer') {
    return {
      title: `Send ${actionData.symbol ?? token?.symbol ?? 'token'}`,
      subtitle: actionData.name ?? token?.name ?? 'Token transfer'
    }
  }

  if (action?.id === 'erc20:approve' || action?.id === 'erc20:revoke') {
    const symbol = actionData.symbol ?? token?.symbol ?? 'token'
    const revoke = action.id === 'erc20:revoke' || safeBigInt(actionData.amount) === 0n

    return {
      title: revoke ? `Revoke ${symbol} allowance` : `Approve ${symbol}`,
      subtitle: 'Allowance change'
    }
  }

  if (isDecodedErc20Approve(req)) {
    const amount = decodedArg(req, 1)
    const revoke = safeBigInt(amount) === 0n
    return {
      title: revoke ? `Revoke ${token?.symbol ?? 'token'} allowance` : `Approve ${token?.symbol ?? 'token'}`,
      subtitle: token?.name ?? 'Allowance change'
    }
  }

  if (isDecodedErc20Transfer(req)) {
    return {
      title: `Send ${token?.symbol ?? 'token'}`,
      subtitle: token?.name ?? 'Token transfer'
    }
  }

  if (actionType) {
    return {
      title: actionType,
      subtitle: 'Recognized action'
    }
  }

  switch (req.classification) {
    case 'CONTRACT_DEPLOY':
      return { title: 'Deploy contract', subtitle: 'Contract creation' }
    case 'CONTRACT_CALL':
      return {
        title: req.decodedData?.method ?? 'Call contract',
        subtitle: req.decodedData?.contractName ?? 'Contract interaction'
      }
    case 'SEND_DATA':
      return { title: 'Send data', subtitle: 'Data transaction' }
    case 'NATIVE_TRANSFER':
      return { title: `Send ${nativeSymbol}`, subtitle: 'Native transfer' }
    case undefined:
    default:
      return { title: 'Review transaction', subtitle: 'Transaction request' }
  }
}

function getDeterministicTransactionEffects(
  req: TransactionSummaryInput,
  nativeSymbol = 'ETH'
): TransactionEffect[] {
  const effects: TransactionEffect[] = []
  const nativeValue = req.data?.value ?? payloadValue(req.payload)

  if (nativeValue !== undefined && safeBigInt(nativeValue) > 0n) {
    effects.push({
      id: 'native-value-out',
      kind: 'native',
      direction: 'out',
      label: 'Asset out',
      amount: nativeValue,
      decimals: 18,
      symbol: nativeSymbol,
      detail: 'Transaction value'
    })
  }

  ;(req.recognizedActions ?? []).forEach((action, index) => {
    const data = recognizedActionData(action)
    if (action.id === 'erc20:transfer') {
      const { amount, recipient } = data
      const token = erc20TokenData(req)
      const decimals = token?.decimals ?? data.decimals
      const symbol = data.symbol ?? token?.symbol ?? 'Token'
      const assetAddress = contractAddress(data.contract) ?? req.data?.to

      effects.push({
        id: `erc20-transfer-${index}`,
        kind: 'erc20',
        direction: 'out',
        label: 'Asset out',
        symbol,
        detail: recipient?.ens ?? shortAddress(recipient?.address),
        ...(amount !== undefined ? { amount } : {}),
        ...(decimals !== undefined ? { decimals } : {}),
        ...(assetAddress ? { assetAddress } : {}),
        ...(data.logoURI ? { logoURI: data.logoURI } : {})
      })
    }

    if (action.id === 'erc20:approve' || action.id === 'erc20:revoke') {
      const { amount, spender } = data
      const token = erc20TokenData(req)
      const decimals = token?.decimals ?? data.decimals
      const symbol = data.symbol ?? token?.symbol ?? 'Token'
      const assetAddress = contractAddress(data.contract) ?? req.data?.to
      const revoke = action.id === 'erc20:revoke' || safeBigInt(amount) === 0n

      effects.push({
        id: `erc20-approval-${index}`,
        kind: 'allowance',
        direction: 'neutral',
        label: revoke ? 'Allowance revoked' : 'Allowance change',
        symbol,
        detail: `${revoke ? 'For' : 'For spender'} ${spender?.ens ?? shortAddress(spender?.address)}${
          isUnlimitedApproval(amount) ? ' (unlimited)' : ''
        }`,
        ...(amount !== undefined ? { amount } : {}),
        ...(decimals !== undefined ? { decimals } : {}),
        ...(assetAddress ? { assetAddress } : {}),
        ...(spender?.address ? { spenderAddress: spender.address } : {}),
        ...(data.logoURI ? { logoURI: data.logoURI } : {})
      })
    }
  })

  if (isDecodedErc20Approve(req)) {
    const spender = decodedArg(req, 0)
    const amount = decodedArg(req, 1)
    const revoke = safeBigInt(amount) === 0n
    const token = erc20TokenData(req)

    effects.push({
      id: 'decoded-erc20-approval',
      kind: 'allowance',
      direction: 'neutral',
      label: revoke ? 'Allowance revoked' : 'Allowance change',
      amount: addHexPrefix(safeBigInt(amount).toString(16)),
      symbol: token?.symbol ?? 'Token',
      detail: `${revoke ? 'For' : 'For spender'} ${shortAddress(spender)}`,
      ...(req.data?.to ? { assetAddress: req.data.to } : {}),
      ...(spender ? { spenderAddress: spender } : {}),
      ...(typeof token?.decimals === 'number' && Number.isInteger(token.decimals)
        ? { decimals: token.decimals }
        : {})
    })
  }

  if (isDecodedErc20Transfer(req)) {
    const recipient = decodedArg(req, 0)
    const amount = decodedArg(req, 1)
    const token = erc20TokenData(req)

    effects.push({
      id: 'decoded-erc20-transfer',
      kind: 'erc20',
      direction: 'out',
      label: 'Asset out',
      amount: addHexPrefix(safeBigInt(amount).toString(16)),
      symbol: token?.symbol ?? 'Token',
      detail: shortAddress(recipient),
      ...(req.data?.to ? { assetAddress: req.data.to } : {}),
      ...(typeof token?.decimals === 'number' && Number.isInteger(token.decimals)
        ? { decimals: token.decimals }
        : {})
    })
  }

  return effects
}

export function getTransactionEffects(
  req: TransactionSummaryInput,
  nativeSymbol = 'ETH'
): TransactionEffect[] {
  const deterministicEffects = getDeterministicTransactionEffects(req, nativeSymbol)
  const simulatedEffects =
    req.simulation?.status === 'success' && Array.isArray(req.simulation.effects)
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

export function getTransactionPositionTokens(req: TransactionSummaryInput): TransactionPositionToken[] {
  const chainId = parseChainId(req.data?.chainId ?? req.chainId)
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

export function getPaidTransactionFee(req: TransactionSummaryInput) {
  const receipt = req.tx?.receipt
  if (!receipt || typeof receipt !== 'object') {
    return undefined
  }

  const rawGasUsed = 'gasUsed' in receipt ? receipt.gasUsed : undefined
  const rawEffectiveGasPrice = 'effectiveGasPrice' in receipt ? receipt.effectiveGasPrice : undefined
  const gasUsed = safeBigInt(
    typeof rawGasUsed === 'string' || typeof rawGasUsed === 'number' || typeof rawGasUsed === 'bigint'
      ? rawGasUsed
      : undefined
  )
  const paidGas = typeof rawEffectiveGasPrice === 'string' ? rawEffectiveGasPrice : req.data?.gasPrice
  const gasPrice = safeBigInt(paidGas)

  if (!gasUsed || !gasPrice) {
    return undefined
  }

  return addHexPrefix((gasUsed * gasPrice).toString(16))
}

function parseChainId(chainId: unknown) {
  if (typeof chainId === 'string' && isHexString(chainId)) {
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
