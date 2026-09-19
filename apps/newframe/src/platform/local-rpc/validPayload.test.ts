import { afterAll, beforeAll, beforeEach, expect, it } from 'bun:test'

import {
  HttpJsonRpcRequestSchema,
  RoutedJsonRpcRequestSchema,
  WebSocketJsonRpcRequestSchema
} from './protocol'
import validatePayloadTyped from './validPayload'

// real function under test, exercised with invalid payloads
const validatePayload = (payload: unknown) =>
  validatePayloadTyped(payload as string, RoutedJsonRpcRequestSchema)

import log from 'electron-log'

beforeAll(() => {
  log.transports.console.level = false
})

afterAll(() => {
  log.transports.console.level = 'debug'
})

interface TestPayload {
  id?: unknown
  jsonrpc?: unknown
  method?: unknown
  params?: unknown
}

let payload: TestPayload

beforeEach(() => {
  // this payload is valid
  payload = {
    id: 7,
    jsonrpc: '2.0',
    method: 'eth_getBalance',
    params: ['0xc93452A74e596e81E4f73Ca1AcFF532089AD4c62']
  }
})

it('returns a valid payload with a string id', () => {
  payload.id = '12'
  const result = validatePayload(JSON.stringify(payload))

  expect(result as unknown).toStrictEqual(payload)
})

it('returns a valid payload with array params', () => {
  const result = validatePayload(JSON.stringify(payload))

  expect(result as unknown).toStrictEqual(payload)
})

it('returns a valid payload with object params', () => {
  payload.params = { asset: { address: '0x912a' } }
  const result = validatePayload(JSON.stringify(payload))

  expect(result as unknown).toStrictEqual(payload)
})

it('changes missing params to an empty array', () => {
  delete payload.params
  const result = validatePayload(JSON.stringify(payload))

  expect(result as unknown).toStrictEqual({
    ...payload,
    params: []
  })
})

it('is not valid if not a string', () => {
  const result = validatePayload({ test: 'bad-data' })

  expect(result).toBe(false)
})

it('is not valid if payload is null', () => {
  const result = validatePayload(null)

  expect(result).toBe(false)
})

it('is not valid if payload is a null string', () => {
  const result = validatePayload('null')

  expect(result).toBe(false)
})

it('is not valid if payload is not an object', () => {
  const result = validatePayload('["eth_chainId"]')

  expect(result).toBe(false)
})

it('is not valid if payload does not include an id', () => {
  delete payload.id
  const result = validatePayload(JSON.stringify(payload))

  expect(result).toBe(false)
})

it('is not valid if payload id is not a string or number', () => {
  payload.id = { id: 1 }
  const result = validatePayload(JSON.stringify(payload))

  expect(result).toBe(false)
})

it('is not valid if payload does not include a method', () => {
  delete payload.method
  const result = validatePayload(JSON.stringify(payload))

  expect(result).toBe(false)
})

it('is not valid if payload method is not a string', () => {
  payload.method = { eth: 'get_balance' }
  const result = validatePayload(JSON.stringify(payload))

  expect(result).toBe(false)
})

it('is not valid if jsonrpc field is not a string', () => {
  payload.jsonrpc = 2.0
  const result = validatePayload(JSON.stringify(payload))

  expect(result).toBe(false)
})

it('is not valid if jsonrpc field is not exactly 2.0', () => {
  payload.jsonrpc = '1.0'
  const result = validatePayload(JSON.stringify(payload))

  expect(result).toBe(false)
})

it('is not valid if params are not an array or object', () => {
  payload.params = 'params'
  const result = validatePayload(JSON.stringify(payload))

  expect(result).toBe(false)
})

it('is not valid if params are null', () => {
  payload.params = null
  const result = validatePayload(JSON.stringify(payload))

  expect(result).toBe(false)
})

it('is not valid with an unknown field', () => {
  const result = validatePayload(JSON.stringify({ ...payload, extra: true }))

  expect(result).toBe(false)
})

it('accepts an explicit routed chain id', () => {
  const result = validatePayload(JSON.stringify({ ...payload, chainId: '0x1' }))

  expect(result as unknown).toEqual({ ...payload, chainId: '0x1' })
})

it('accepts extensions only through their transport schema', () => {
  const httpPayload = { ...payload, pollId: 'poll-1' }
  const webSocketPayload = {
    ...payload,
    __frameOrigin: 'https://app.example',
    __frameFavicon: 'https://app.example/favicon.png',
    __extensionConnecting: true
  }

  expect(validatePayloadTyped(JSON.stringify(httpPayload), HttpJsonRpcRequestSchema) as unknown).toEqual(
    httpPayload
  )
  expect(
    validatePayloadTyped(JSON.stringify(webSocketPayload), WebSocketJsonRpcRequestSchema) as unknown
  ).toEqual(webSocketPayload)
  expect(validatePayload(JSON.stringify(httpPayload))).toBe(false)
})
