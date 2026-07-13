import { JSONTx } from '@ethereumjs/tx'
import { addHexPrefix, isHexString } from '@ethereumjs/util'

import { MAX_HEX } from '../../constants'

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

export function typeSupportsBaseFee(type: string) {
  return parseInt(type || '0') === 2
}

export function usesBaseFee(rawTx: TransactionData) {
  return typeSupportsBaseFee(rawTx.type)
}

export type TransactionEffectDirection = 'out' | 'in' | 'neutral'
export type TransactionEffectKind = 'native' | 'erc20' | 'allowance'

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

export type TransactionSimulationStatus = 'loading' | 'success' | 'unavailable' | 'error'

export interface TransactionSimulation {
  status: TransactionSimulationStatus
  effects?: TransactionEffect[]
  source?: string
  error?: string
  updatedAt?: number
}

export interface TransactionIntent {
  title: string
  subtitle: string
}

function safeBigInt(value?: string | number | bigint | null) {
  if (value === undefined || value === null || value === '') return 0n

  try {
    return BigInt(value)
  } catch {
    return 0n
  }
}

function shortAddress(address?: string) {
  if (!address) return ''
  return `${address.slice(0, 8)}...${address.slice(-6)}`
}

function firstRecognizedAction(req: any) {
  return (req?.recognizedActions || [])[0]
}

function isUnlimitedApproval(amount?: string) {
  return amount?.toLowerCase?.() === MAX_HEX.toLowerCase()
}

function erc20TokenData(req: any) {
  return req?.tokenData
}

function decodedArg(req: any, index: number) {
  return req?.decodedData?.args?.[index]?.value
}

function hasRecognizedErc20Action(req: any) {
  return (req?.recognizedActions || []).some((action: any) =>
    ['erc20:transfer', 'erc20:approve', 'erc20:revoke'].includes(action?.id)
  )
}

function isDecodedErc20Approve(req: any) {
  return (
    !hasRecognizedErc20Action(req) &&
    req?.decodedData?.signature === 'approve(address,uint256)' &&
    req?.decodedData?.method === 'approve'
  )
}

function isDecodedErc20Transfer(req: any) {
  return (
    !hasRecognizedErc20Action(req) &&
    req?.decodedData?.signature === 'transfer(address,uint256)' &&
    req?.decodedData?.method === 'transfer'
  )
}

export function getTransactionIntent(req: any, nativeSymbol = 'ETH'): TransactionIntent {
  const action = firstRecognizedAction(req)
  const [, actionType] = (action?.id || '').split(':')

  if (action?.id === 'erc20:transfer') {
    return {
      title: `Send ${action.data?.symbol || 'token'}`,
      subtitle: action.data?.name || 'Token transfer'
    }
  }

  if (action?.id === 'erc20:approve' || action?.id === 'erc20:revoke') {
    const symbol = action.data?.symbol || 'token'
    const revoke = action?.id === 'erc20:revoke' || safeBigInt(action.data?.amount) === 0n

    return {
      title: revoke ? `Revoke ${symbol} allowance` : `Approve ${symbol}`,
      subtitle: 'Allowance change'
    }
  }

  if (isDecodedErc20Approve(req)) {
    const amount = decodedArg(req, 1)
    const revoke = safeBigInt(amount) === 0n
    const token = erc20TokenData(req)
    return {
      title: revoke ? `Revoke ${token?.symbol || 'token'} allowance` : `Approve ${token?.symbol || 'token'}`,
      subtitle: token?.name || 'Allowance change'
    }
  }

  if (isDecodedErc20Transfer(req)) {
    const token = erc20TokenData(req)
    return {
      title: `Send ${token?.symbol || 'token'}`,
      subtitle: token?.name || 'Token transfer'
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
        title: req?.decodedData?.method || 'Call contract',
        subtitle: req?.decodedData?.contractName || 'Contract interaction'
      }
    case 'SEND_DATA':
      return { title: 'Send data', subtitle: 'Data transaction' }
    case 'NATIVE_TRANSFER':
      return { title: `Send ${nativeSymbol}`, subtitle: 'Native transfer' }
    default:
      return { title: 'Review transaction', subtitle: 'Transaction request' }
  }
}

export function getDeterministicTransactionEffects(req: any, nativeSymbol = 'ETH'): TransactionEffect[] {
  const effects: TransactionEffect[] = []
  const nativeValue = req?.data?.value || req?.payload?.params?.[0]?.value

  if (safeBigInt(nativeValue) > 0n) {
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

  ;(req?.recognizedActions || []).forEach((action: any, index: number) => {
    if (action?.id === 'erc20:transfer') {
      const { amount, decimals, symbol, recipient } = action.data || {}

      effects.push({
        id: `erc20-transfer-${index}`,
        kind: 'erc20',
        direction: 'out',
        label: 'Asset out',
        amount,
        decimals,
        symbol,
        detail: recipient?.ens || shortAddress(recipient?.address),
        ...(action.data?.contract
          ? { assetAddress: action.data.contract?.address || action.data.contract }
          : {}),
        ...(action.data?.logoURI ? { logoURI: action.data.logoURI } : {})
      })
    }

    if (action?.id === 'erc20:approve' || action?.id === 'erc20:revoke') {
      const { amount, decimals, symbol, spender } = action.data || {}
      const revoke = action?.id === 'erc20:revoke' || safeBigInt(amount) === 0n

      effects.push({
        id: `erc20-approval-${index}`,
        kind: 'allowance',
        direction: 'neutral',
        label: revoke ? 'Allowance revoked' : 'Allowance change',
        amount,
        decimals,
        symbol,
        detail: `${revoke ? 'For' : 'For spender'} ${spender?.ens || shortAddress(spender?.address)}${
          isUnlimitedApproval(amount) ? ' (unlimited)' : ''
        }`,
        ...(action.data?.contract
          ? { assetAddress: action.data.contract?.address || action.data.contract }
          : {}),
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
      decimals: token?.decimals ?? 18,
      symbol: token?.symbol || 'Token',
      detail: `${revoke ? 'For' : 'For spender'} ${shortAddress(spender)}`,
      assetAddress: req?.data?.to
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
      decimals: token?.decimals ?? 18,
      symbol: token?.symbol || 'Token',
      detail: shortAddress(recipient),
      assetAddress: req?.data?.to
    })
  }

  return effects
}

export function getTransactionEffects(req: any, nativeSymbol = 'ETH'): TransactionEffect[] {
  const deterministicEffects = getDeterministicTransactionEffects(req, nativeSymbol)
  const simulatedEffects =
    req?.simulation?.status === 'success' && Array.isArray(req.simulation.effects)
      ? req.simulation.effects
      : []

  if (!simulatedEffects.length) return deterministicEffects

  const deterministicNeutralEffects = deterministicEffects.filter((effect) => effect.direction === 'neutral')

  return [...simulatedEffects, ...deterministicNeutralEffects]
}

export function getTransactionPositionTokens(req: any): TransactionPositionToken[] {
  const chainId = parseChainId(req?.data?.chainId ?? req?.chainId)
  if (!Number.isInteger(chainId) || chainId <= 0) return []

  const tokens = new Map<string, TransactionPositionToken>()

  getTransactionEffects(req).forEach((effect) => {
    const address = (effect.assetAddress || '').trim().toLowerCase()
    if (effect.kind !== 'erc20' || effect.direction === 'neutral') return
    if (!/^0x[0-9a-f]{40}$/.test(address)) return

    const symbol = effect.symbol || 'Token'
    const decimals = Number.isInteger(effect.decimals) ? Number(effect.decimals) : 18
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

export function getPaidTransactionFee(req: any) {
  const receipt = req?.tx?.receipt
  if (!receipt) return undefined

  const gasUsed = safeBigInt(receipt.gasUsed)
  const paidGas = receipt.effectiveGasPrice || req?.data?.gasPrice
  const gasPrice = safeBigInt(paidGas)

  if (!gasUsed || !gasPrice) return undefined

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
  if (!tx.chainId) return tx

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
