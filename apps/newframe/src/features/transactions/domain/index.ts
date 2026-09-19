import type { JSONTx } from '@ethereumjs/tx'
import { addHexPrefix, isHexString } from '@ethereumjs/util'

import { TxClassification, type Identity, type TransactionRequest } from '../../requests/contract/requests.js'
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
  amount?: string | undefined
  decimals?: number | undefined
  symbol: string
  detail?: string
  assetAddress?: string | undefined
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

type Erc20Action = {
  id: string
  data?: {
    amount?: string
    contract?: string | Identity
    decimals?: number
    logoURI?: string
    name?: string
    recipient?: Identity
    spender?: Identity
    symbol?: string
  }
}

type TransactionRequestLike = Partial<TransactionRequest>

function firstRecognizedAction(req: TransactionRequestLike) {
  return (req.recognizedActions as Erc20Action[] | undefined)?.[0]
}

function isUnlimitedApproval(amount?: string) {
  return amount?.toLowerCase?.() === MAX_HEX.toLowerCase()
}

function erc20TokenData(req: TransactionRequestLike) {
  return req.tokenData
}

function decodedArg(req: TransactionRequestLike, index: number) {
  return req.decodedData?.args?.[index]?.value
}

function hasRecognizedErc20Action(req: TransactionRequestLike) {
  return (req.recognizedActions ?? []).some((action) =>
    ['erc20:transfer', 'erc20:approve', 'erc20:revoke'].includes(action.id)
  )
}

function isDecodedErc20Approve(req: TransactionRequestLike) {
  return (
    !hasRecognizedErc20Action(req) &&
    req?.decodedData?.signature === 'approve(address,uint256)' &&
    req?.decodedData?.method === 'approve'
  )
}

function isDecodedErc20Transfer(req: TransactionRequestLike) {
  return (
    !hasRecognizedErc20Action(req) &&
    req?.decodedData?.signature === 'transfer(address,uint256)' &&
    req?.decodedData?.method === 'transfer'
  )
}

function getTransactionIntentForRequest(
  req: TransactionRequestLike,
  nativeSymbol = 'ETH'
): TransactionIntent {
  const action = firstRecognizedAction(req)
  const [, actionType] = (action?.id ?? '').split(':')
  const token = erc20TokenData(req)

  if (action?.id === 'erc20:transfer') {
    return {
      title: `Send ${action.data?.symbol ?? token?.symbol ?? 'token'}`,
      subtitle: action.data?.name ?? token?.name ?? 'Token transfer'
    }
  }

  if (action?.id === 'erc20:approve' || action?.id === 'erc20:revoke') {
    const symbol = action.data?.symbol ?? token?.symbol ?? 'token'
    const revoke = action?.id === 'erc20:revoke' || safeBigInt(action.data?.amount) === 0n

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

  switch (req?.classification) {
    case TxClassification.CONTRACT_DEPLOY:
      return { title: 'Deploy contract', subtitle: 'Contract creation' }
    case TxClassification.CONTRACT_CALL:
      return {
        title: req?.decodedData?.method ?? 'Call contract',
        subtitle: req?.decodedData?.contractName ?? 'Contract interaction'
      }
    case TxClassification.SEND_DATA:
      return { title: 'Send data', subtitle: 'Data transaction' }
    case TxClassification.NATIVE_TRANSFER:
      return { title: `Send ${nativeSymbol}`, subtitle: 'Native transfer' }
    case undefined:
    default:
      return { title: 'Review transaction', subtitle: 'Transaction request' }
  }
}

export function getTransactionIntent(req: unknown, nativeSymbol = 'ETH'): TransactionIntent {
  return getTransactionIntentForRequest(req as TransactionRequestLike, nativeSymbol)
}

function getDeterministicTransactionEffects(
  req: TransactionRequestLike,
  nativeSymbol = 'ETH'
): TransactionEffect[] {
  const effects: TransactionEffect[] = []
  const nativeValue = req?.data?.value ?? req?.payload?.params?.[0]?.value

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

  ;((req.recognizedActions ?? []) as Erc20Action[]).forEach((action, index) => {
    if (action?.id === 'erc20:transfer') {
      const { amount, recipient } = action.data ?? {}
      const token = erc20TokenData(req)
      const decimals = token?.decimals ?? action.data?.decimals
      const symbol = action.data?.symbol ?? token?.symbol
      let assetAddress: string | undefined
      if (typeof action.data?.contract === 'string') {
        assetAddress = action.data.contract
      } else if (action.data?.contract?.address) {
        assetAddress = action.data.contract.address
      } else if (req.data?.to) {
        assetAddress = req.data.to
      }

      effects.push({
        id: `erc20-transfer-${index}`,
        kind: 'erc20',
        direction: 'out',
        label: 'Asset out',
        amount,
        decimals,
        symbol: symbol as string,
        detail: recipient?.ens ?? shortAddress(recipient?.address),
        ...(assetAddress ? { assetAddress } : {}),
        ...(action.data?.logoURI ? { logoURI: action.data.logoURI } : {})
      })
    }

    if (action?.id === 'erc20:approve' || action?.id === 'erc20:revoke') {
      const { amount, spender } = action.data ?? {}
      const token = erc20TokenData(req)
      const decimals = token?.decimals ?? action.data?.decimals
      const symbol = action.data?.symbol ?? token?.symbol
      const revoke = action?.id === 'erc20:revoke' || safeBigInt(amount) === 0n
      let assetAddress: string | undefined
      if (typeof action.data?.contract === 'string') {
        assetAddress = action.data.contract
      } else if (action.data?.contract?.address) {
        assetAddress = action.data.contract.address
      } else if (req.data?.to) {
        assetAddress = req.data.to
      }

      effects.push({
        id: `erc20-approval-${index}`,
        kind: 'allowance',
        direction: 'neutral',
        label: revoke ? 'Allowance revoked' : 'Allowance change',
        amount,
        decimals,
        symbol: symbol as string,
        detail: `${revoke ? 'For' : 'For spender'} ${spender?.ens ?? shortAddress(spender?.address)}${
          isUnlimitedApproval(amount) ? ' (unlimited)' : ''
        }`,
        ...(assetAddress ? { assetAddress } : {}),
        ...(spender?.address ? { spenderAddress: spender.address } : {}),
        ...(action.data?.logoURI ? { logoURI: action.data.logoURI } : {})
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
      assetAddress: req.data?.to,
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
      assetAddress: req.data?.to,
      ...(typeof token?.decimals === 'number' && Number.isInteger(token.decimals)
        ? { decimals: token.decimals }
        : {})
    })
  }

  return effects
}

function getTransactionEffectsForRequest(
  req: TransactionRequestLike,
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

export function getTransactionEffects(req: unknown, nativeSymbol = 'ETH'): TransactionEffect[] {
  return getTransactionEffectsForRequest(req as TransactionRequestLike, nativeSymbol)
}

export function getTransactionPositionTokens(req: unknown): TransactionPositionToken[] {
  const request = req as TransactionRequestLike
  const chainId = parseChainId(
    request.data?.chainId ?? (request as TransactionRequest & { chainId?: string }).chainId ?? ''
  )
  if (!Number.isInteger(chainId) || chainId <= 0) {
    return []
  }

  const tokens = new Map<string, TransactionPositionToken>()

  getTransactionEffectsForRequest(request).forEach((effect) => {
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

export function getPaidTransactionFee(req: unknown) {
  const request = req as TransactionRequestLike
  const receipt = request.tx?.receipt
  if (!receipt) {
    return undefined
  }

  const gasUsed = safeBigInt(receipt.gasUsed)
  const paidGas = receipt.effectiveGasPrice ?? request.data?.gasPrice
  const gasPrice = safeBigInt(paidGas)

  if (!gasUsed || !gasPrice) {
    return undefined
  }

  return addHexPrefix((gasUsed * gasPrice).toString(16))
}

function parseChainId(chainId: string) {
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
