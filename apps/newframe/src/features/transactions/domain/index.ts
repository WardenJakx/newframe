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
  id: string
  data: RecognizedActionData
}

interface Erc20TokenMetadata {
  decimals?: number
  name?: string
  symbol?: string
}

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function optionalString(value: unknown) {
  return typeof value === 'string' ? value : undefined
}

function optionalNumber(value: unknown) {
  return typeof value === 'number' ? value : undefined
}

function optionalStringOrNumber(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' ? value : undefined
}

function optionalIdentity(value: unknown) {
  if (!isRecord(value)) {
    return undefined
  }

  const address = optionalString(value.address)
  const ens = optionalString(value.ens)
  return address || ens ? { ...(address ? { address } : {}), ...(ens ? { ens } : {}) } : undefined
}

function requestRecord(req: unknown) {
  return isRecord(req) ? req : {}
}

function recognizedAction(value: unknown): RecognizedAction | undefined {
  if (!isRecord(value) || typeof value.id !== 'string') {
    return undefined
  }

  const rawData = isRecord(value.data) ? value.data : {}
  const amount = optionalString(rawData.amount)
  const contractRecord = optionalIdentity(rawData.contract)
  const contract = optionalString(rawData.contract) ?? contractRecord
  const decimals = optionalNumber(rawData.decimals)
  const logoURI = optionalString(rawData.logoURI)
  const name = optionalString(rawData.name)
  const recipient = optionalIdentity(rawData.recipient)
  const spender = optionalIdentity(rawData.spender)
  const symbol = optionalString(rawData.symbol)

  return {
    id: value.id,
    data: {
      ...(amount ? { amount } : {}),
      ...(contract ? { contract } : {}),
      ...(decimals !== undefined ? { decimals } : {}),
      ...(logoURI ? { logoURI } : {}),
      ...(name ? { name } : {}),
      ...(recipient ? { recipient } : {}),
      ...(spender ? { spender } : {}),
      ...(symbol ? { symbol } : {})
    }
  }
}

function recognizedActions(req: unknown) {
  const actions = requestRecord(req).recognizedActions
  return Array.isArray(actions)
    ? actions.flatMap((action: unknown) => {
        const parsed = recognizedAction(action)
        return parsed ? [parsed] : []
      })
    : []
}

function safeBigInt(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return 0n
  }
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'bigint') {
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

function firstRecognizedAction(req: unknown) {
  return recognizedActions(req)[0]
}

function isUnlimitedApproval(amount?: string) {
  return amount?.toLowerCase() === MAX_HEX.toLowerCase()
}

function erc20TokenData(req: unknown): Erc20TokenMetadata | undefined {
  const rawToken = requestRecord(req).tokenData
  if (!isRecord(rawToken)) {
    return undefined
  }

  const decimals = optionalNumber(rawToken.decimals)
  const name = optionalString(rawToken.name)
  const symbol = optionalString(rawToken.symbol)
  return {
    ...(decimals !== undefined ? { decimals } : {}),
    ...(name ? { name } : {}),
    ...(symbol ? { symbol } : {})
  }
}

function decodedArg(req: unknown, index: number): unknown {
  const decodedData = requestRecord(req).decodedData
  if (!isRecord(decodedData) || !Array.isArray(decodedData.args)) {
    return undefined
  }

  const arg: unknown = decodedData.args[index]
  return isRecord(arg) ? arg.value : undefined
}

function hasRecognizedErc20Action(req: unknown) {
  return recognizedActions(req).some((action) =>
    ['erc20:transfer', 'erc20:approve', 'erc20:revoke'].includes(action.id)
  )
}

function isDecodedErc20Approve(req: unknown) {
  const decodedData = requestRecord(req).decodedData
  return (
    !hasRecognizedErc20Action(req) &&
    isRecord(decodedData) &&
    decodedData.signature === 'approve(address,uint256)' &&
    decodedData.method === 'approve'
  )
}

function isDecodedErc20Transfer(req: unknown) {
  const decodedData = requestRecord(req).decodedData
  return (
    !hasRecognizedErc20Action(req) &&
    isRecord(decodedData) &&
    decodedData.signature === 'transfer(address,uint256)' &&
    decodedData.method === 'transfer'
  )
}

export function getTransactionIntent(req: unknown, nativeSymbol = 'ETH'): TransactionIntent {
  const request = requestRecord(req)
  const action = firstRecognizedAction(req)
  const [, actionType] = (action?.id ?? '').split(':')
  const token = erc20TokenData(req)

  if (action?.id === 'erc20:transfer') {
    return {
      title: `Send ${action.data.symbol ?? token?.symbol ?? 'token'}`,
      subtitle: action.data.name ?? token?.name ?? 'Token transfer'
    }
  }

  if (action?.id === 'erc20:approve' || action?.id === 'erc20:revoke') {
    const symbol = action.data.symbol ?? token?.symbol ?? 'token'
    const revoke = action.id === 'erc20:revoke' || safeBigInt(action.data.amount) === 0n

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

  const decodedData = isRecord(request.decodedData) ? request.decodedData : {}
  switch (request.classification) {
    case 'CONTRACT_DEPLOY':
      return { title: 'Deploy contract', subtitle: 'Contract creation' }
    case 'CONTRACT_CALL':
      return {
        title: optionalString(decodedData.method) ?? 'Call contract',
        subtitle: optionalString(decodedData.contractName) ?? 'Contract interaction'
      }
    case 'SEND_DATA':
      return { title: 'Send data', subtitle: 'Data transaction' }
    case 'NATIVE_TRANSFER':
      return { title: `Send ${nativeSymbol}`, subtitle: 'Native transfer' }
    default:
      return { title: 'Review transaction', subtitle: 'Transaction request' }
  }
}

function getDeterministicTransactionEffects(req: unknown, nativeSymbol = 'ETH'): TransactionEffect[] {
  const request = requestRecord(req)
  const data = isRecord(request.data) ? request.data : {}
  const payload = isRecord(request.payload) ? request.payload : {}
  const params: unknown[] = Array.isArray(payload.params) ? payload.params : []
  const firstParam: unknown = params[0]
  const firstParamRecord = isRecord(firstParam) ? firstParam : {}
  const effects: TransactionEffect[] = []
  const nativeValue = optionalString(data.value) ?? optionalString(firstParamRecord.value)

  if (nativeValue && safeBigInt(nativeValue) > 0n) {
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

  recognizedActions(req).forEach((action, index) => {
    if (action.id === 'erc20:transfer') {
      const { amount, recipient } = action.data
      const token = erc20TokenData(req)
      const decimals = token?.decimals ?? action.data.decimals
      const symbol = action.data.symbol ?? token?.symbol ?? 'Token'
      const assetAddress =
        (typeof action.data.contract === 'string' ? action.data.contract : action.data.contract?.address) ??
        optionalString(data.to)

      effects.push({
        id: `erc20-transfer-${index}`,
        kind: 'erc20',
        direction: 'out',
        label: 'Asset out',
        symbol,
        detail: recipient?.ens ?? shortAddress(recipient?.address),
        ...(amount ? { amount } : {}),
        ...(decimals !== undefined ? { decimals } : {}),
        ...(assetAddress ? { assetAddress } : {}),
        ...(action.data.logoURI ? { logoURI: action.data.logoURI } : {})
      })
    }

    if (action.id === 'erc20:approve' || action.id === 'erc20:revoke') {
      const { amount, spender } = action.data
      const token = erc20TokenData(req)
      const decimals = token?.decimals ?? action.data.decimals
      const symbol = action.data.symbol ?? token?.symbol ?? 'Token'
      const revoke = action.id === 'erc20:revoke' || safeBigInt(amount) === 0n
      const assetAddress =
        (typeof action.data.contract === 'string' ? action.data.contract : action.data.contract?.address) ??
        optionalString(data.to)

      effects.push({
        id: `erc20-approval-${index}`,
        kind: 'allowance',
        direction: 'neutral',
        label: revoke ? 'Allowance revoked' : 'Allowance change',
        symbol,
        detail: `${revoke ? 'For' : 'For spender'} ${spender?.ens ?? shortAddress(spender?.address)}${
          isUnlimitedApproval(amount) ? ' (unlimited)' : ''
        }`,
        ...(amount ? { amount } : {}),
        ...(decimals !== undefined ? { decimals } : {}),
        ...(assetAddress ? { assetAddress } : {}),
        ...(spender?.address ? { spenderAddress: spender.address } : {}),
        ...(action.data.logoURI ? { logoURI: action.data.logoURI } : {})
      })
    }
  })

  if (isDecodedErc20Approve(req)) {
    const spender = optionalString(decodedArg(req, 0))
    const amount = decodedArg(req, 1)
    const revoke = safeBigInt(amount) === 0n
    const token = erc20TokenData(req)
    const decimals = token?.decimals
    const assetAddress = optionalString(data.to)

    effects.push({
      id: 'decoded-erc20-approval',
      kind: 'allowance',
      direction: 'neutral',
      label: revoke ? 'Allowance revoked' : 'Allowance change',
      amount: addHexPrefix(safeBigInt(amount).toString(16)),
      symbol: token?.symbol ?? 'Token',
      detail: `${revoke ? 'For' : 'For spender'} ${shortAddress(spender)}`,
      ...(assetAddress ? { assetAddress } : {}),
      ...(spender ? { spenderAddress: spender } : {}),
      ...(decimals !== undefined && Number.isInteger(decimals) ? { decimals } : {})
    })
  }

  if (isDecodedErc20Transfer(req)) {
    const recipient = optionalString(decodedArg(req, 0))
    const amount = decodedArg(req, 1)
    const token = erc20TokenData(req)
    const decimals = token?.decimals
    const assetAddress = optionalString(data.to)

    effects.push({
      id: 'decoded-erc20-transfer',
      kind: 'erc20',
      direction: 'out',
      label: 'Asset out',
      amount: addHexPrefix(safeBigInt(amount).toString(16)),
      symbol: token?.symbol ?? 'Token',
      detail: shortAddress(recipient),
      ...(assetAddress ? { assetAddress } : {}),
      ...(decimals !== undefined && Number.isInteger(decimals) ? { decimals } : {})
    })
  }

  return effects
}

function isTransactionEffect(value: unknown): value is TransactionEffect {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.id === 'string' &&
    (value.kind === 'native' || value.kind === 'erc20' || value.kind === 'allowance') &&
    (value.direction === 'out' || value.direction === 'in' || value.direction === 'neutral') &&
    typeof value.label === 'string' &&
    typeof value.symbol === 'string' &&
    (value.amount === undefined || typeof value.amount === 'string') &&
    (value.decimals === undefined || typeof value.decimals === 'number') &&
    (value.detail === undefined || typeof value.detail === 'string') &&
    (value.assetAddress === undefined || typeof value.assetAddress === 'string') &&
    (value.spenderAddress === undefined || typeof value.spenderAddress === 'string') &&
    (value.logoURI === undefined || typeof value.logoURI === 'string')
  )
}

export function getTransactionEffects(req: unknown, nativeSymbol = 'ETH'): TransactionEffect[] {
  const request = requestRecord(req)
  const deterministicEffects = getDeterministicTransactionEffects(req, nativeSymbol)
  const simulation = isRecord(request.simulation) ? request.simulation : {}
  const simulatedEffects =
    simulation.status === 'success' && Array.isArray(simulation.effects)
      ? simulation.effects.filter(isTransactionEffect)
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

export function getTransactionPositionTokens(req: unknown): TransactionPositionToken[] {
  const request = requestRecord(req)
  const data = isRecord(request.data) ? request.data : {}
  const chainId = parseChainId(
    optionalStringOrNumber(data.chainId) ?? optionalStringOrNumber(request.chainId) ?? ''
  )
  if (!Number.isInteger(chainId) || chainId <= 0) {
    return []
  }

  const tokens = new Map<string, TransactionPositionToken>()
  const simulation = isRecord(request.simulation) ? request.simulation : {}
  const rawSimulationEffects =
    simulation.status === 'success' && Array.isArray(simulation.effects)
      ? simulation.effects.filter(isPositionEffect)
      : []

  ;[...getTransactionEffects(req), ...rawSimulationEffects].forEach((effect) => {
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

type PositionEffect = Pick<
  TransactionEffect,
  'assetAddress' | 'decimals' | 'direction' | 'kind' | 'logoURI' | 'symbol'
>

function isPositionEffect(value: unknown): value is PositionEffect {
  return (
    isRecord(value) &&
    (value.kind === 'native' || value.kind === 'erc20' || value.kind === 'allowance') &&
    (value.direction === 'out' || value.direction === 'in' || value.direction === 'neutral') &&
    typeof value.symbol === 'string' &&
    (value.decimals === undefined || typeof value.decimals === 'number') &&
    (value.assetAddress === undefined || typeof value.assetAddress === 'string') &&
    (value.logoURI === undefined || typeof value.logoURI === 'string')
  )
}

export function getPaidTransactionFee(req: any) {
  const receipt = req?.tx?.receipt
  if (!receipt) {
    return undefined
  }

  const gasUsed = safeBigInt(receipt.gasUsed)
  const paidGas = receipt.effectiveGasPrice ?? req?.data?.gasPrice
  const gasPrice = safeBigInt(paidGas)

  if (!gasUsed || !gasPrice) {
    return undefined
  }

  return addHexPrefix((gasUsed * gasPrice).toString(16))
}

function parseChainId(chainId: string | number) {
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
