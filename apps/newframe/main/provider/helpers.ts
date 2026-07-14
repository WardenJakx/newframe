import { padToEven, unpadHex, addHexPrefix, stripHexPrefix } from '@ethereumjs/util'
import { recoverPersonalSignature } from '@metamask/eth-sig-util'
import log from 'electron-log'
import { isHexString } from 'ethers'

import store from '../store'
import protectedMethods from '../api/protectedMethods'
import type { TransactionRequest } from '../accounts'
import { usesBaseFee, TransactionData, GasFeesSource } from '../../resources/domain/transaction'
import { getAddress } from '../../resources/utils'
import isUtf8 from './isUtf8'

const permission = (date: number, method: string) => ({ parentCapability: method, date })

export function decodeMessage(rawMessage: string) {
  if (isHexString(rawMessage)) {
    const buff = Buffer.from(stripHexPrefix(rawMessage), 'hex')
    return buff.length === 32 || !isUtf8(buff) ? rawMessage : buff.toString('utf8')
  }

  // replace all multiple line returns with just one to prevent excess space in message
  return rawMessage.replaceAll(/[\n\r]+/g, '\n')
}

export function checkExistingNonceGas(tx: TransactionData) {
  const { from, nonce } = tx

  const account = store.getState().main.accounts[(from || '').toLowerCase()]
  const reqs = (account?.requests || {}) as Record<string, TransactionRequest>

  const requests = Object.keys(reqs || {}).map((key) => reqs[key])
  const existing = requests.filter(
    (r) => r.mode === 'monitor' && r.status !== 'error' && r.data.nonce === nonce
  )

  if (existing.length > 0) {
    if (tx.maxPriorityFeePerGas && tx.maxFeePerGas) {
      const existingFee = Math.max(...existing.map((r) => Number(r.data.maxPriorityFeePerGas || 0)))
      const existingMax = Math.max(...existing.map((r) => Number(r.data.maxFeePerGas || 0)))
      const feeInt = parseInt(tx.maxPriorityFeePerGas)
      const maxInt = parseInt(tx.maxFeePerGas)
      if (existingFee * 1.1 >= feeInt || existingMax * 1.1 >= maxInt) {
        // Bump fees by 10%
        const bumpedFee = Math.max(Math.ceil(existingFee * 1.1), feeInt)
        const bumpedBase = Math.max(Math.ceil((existingMax - existingFee) * 1.1), Math.ceil(maxInt - feeInt))
        tx.maxFeePerGas = '0x' + (bumpedBase + bumpedFee).toString(16)
        tx.maxPriorityFeePerGas = '0x' + bumpedFee.toString(16)
        tx.gasFeesSource = GasFeesSource.Frame
        tx.feesUpdated = true
      }
    } else if (tx.gasPrice) {
      const existingPrice = Math.max(...existing.map((r) => Number(r.data.gasPrice || 0)))
      const priceInt = parseInt(tx.gasPrice)
      if (existingPrice >= priceInt) {
        // Bump price by 10%
        const bumpedPrice = Math.ceil(existingPrice * 1.1)
        tx.gasPrice = '0x' + bumpedPrice.toString(16)
        tx.gasFeesSource = GasFeesSource.Frame
        tx.feesUpdated = true
      }
    }
  }

  return tx
}

export function feeTotalOverMax(rawTx: TransactionData, maxTotalFee: number) {
  const maxFeePerGas = usesBaseFee(rawTx)
    ? parseInt(rawTx.maxFeePerGas || '', 16)
    : parseInt(rawTx.gasPrice || '', 16)
  const gasLimit = parseInt(rawTx.gasLimit || '', 16)
  const totalFee = maxFeePerGas * gasLimit
  return totalFee > maxTotalFee
}

function parseValue(value = '') {
  const parsedHex = parseInt(value, 16)
  return (!!parsedHex && unpadHex(addHexPrefix(value))) || '0x0'
}

export function getRawTx(newTx: RPC.SendTransaction.TxParams): TransactionData {
  const { gas, gasLimit, data, value, type, from, to, ...rawTx } = newTx
  const getNonce = () => {
    // pass through hex string or undefined
    if (rawTx.nonce === undefined || isHexString(rawTx.nonce)) {
      return rawTx.nonce
    }

    // convert positive integer strings to hex, reject everything else
    if (!/^\d+$/.test(rawTx.nonce)) {
      throw new Error('Invalid nonce')
    }
    return addHexPrefix(BigInt(rawTx.nonce).toString(16))
  }

  const tx: TransactionData = {
    ...rawTx,
    ...(from && { from: getAddress(from) }),
    ...(to && { to: getAddress(to) }),
    type: '0x0',
    value: parseValue(value),
    data: addHexPrefix(padToEven(stripHexPrefix(data || '0x'))),
    gasLimit: gasLimit || gas,
    chainId: rawTx.chainId,
    nonce: getNonce(),
    gasFeesSource: GasFeesSource.Dapp
  }

  return tx
}

export function gasFees(rawTx: TransactionData) {
  return store.getState().main.networksMeta.ethereum[parseInt(rawTx.chainId, 16)].gas
}

export function resError(errorData: string | EVMError, request: RPCId, res: RPCErrorCallback) {
  const error =
    typeof errorData === 'string'
      ? { message: errorData, code: -1 }
      : { message: errorData.message, code: errorData.code || -1 }

  log.warn(error)
  res({ id: request.id, jsonrpc: request.jsonrpc, error })
}

export function getSignedAddress(signed: string, message: string, cb: Callback<string>) {
  const signature = Buffer.from((signed || '').replace('0x', ''), 'hex')
  if (signature.length !== 65)
    return cb(new Error('Newframe verifySignature: Signature has incorrect length'))

  // normalize a recovery id of 0/1 to 27/28 before recovering the address
  let v = signature[64]
  v = v === 0 || v === 1 ? v + 27 : v
  const normalizedSignature = addHexPrefix(
    Buffer.concat([signature.subarray(0, 64), Buffer.from([v])]).toString('hex')
  )

  try {
    cb(null, recoverPersonalSignature({ data: message, signature: normalizedSignature }))
  } catch (e) {
    cb(e as Error)
  }
}

export function getPermissions(payload: JSONRPCRequestPayload, res: RPCRequestCallback) {
  const now = new Date().getTime()
  const toPermission = permission.bind(null, now)
  const allowedOperations = protectedMethods.map(toPermission)

  res({ id: payload.id, jsonrpc: '2.0', result: allowedOperations })
}

export function requestPermissions(payload: JSONRPCRequestPayload, res: RPCRequestCallback) {
  // we already require the user to grant permission to call this method so
  // we just need to return permission objects for the requested operations
  const now = new Date().getTime()
  const requestedOperations = (payload.params || []).map((param) => permission(now, Object.keys(param)[0]))

  res({ id: payload.id, jsonrpc: '2.0', result: requestedOperations })
}

export function ecRecover(payload: JSONRPCRequestPayload, res: RPCRequestCallback) {
  const [message, signed] = payload.params

  getSignedAddress(signed, message, (err, verifiedAddress) => {
    if (err) return resError(err.message, payload, res)
    res({ id: payload.id, jsonrpc: payload.jsonrpc, result: verifiedAddress })
  })
}
