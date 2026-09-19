import { describe, expect, it } from 'bun:test'

import {
  EthSubscriptionNotificationSchema,
  HttpJsonRpcRequestSchema,
  JsonRpcRequestSchema,
  JsonRpcResponseOrNotificationSchema,
  JsonRpcResponseSchema,
  RoutedJsonRpcRequestSchema,
  WebSocketJsonRpcRequestSchema,
  extractJsonRpcId
} from './protocol'

describe('JSON-RPC requests', () => {
  it('parses canonical requests and defaults omitted params', () => {
    expect(JsonRpcRequestSchema.parse({ id: 1, jsonrpc: '2.0', method: 'eth_chainId' })).toEqual({
      id: 1,
      jsonrpc: '2.0',
      method: 'eth_chainId',
      params: []
    })
  })

  it('supports only the extensions selected for a transport', () => {
    expect(
      RoutedJsonRpcRequestSchema.safeParse({
        id: 1,
        jsonrpc: '2.0',
        method: 'eth_chainId',
        params: [],
        chainId: '0x1'
      }).success
    ).toBe(true)
    expect(
      HttpJsonRpcRequestSchema.safeParse({
        id: 1,
        jsonrpc: '2.0',
        method: 'eth_pollSubscriptions',
        params: [],
        pollId: 'poll-1'
      }).success
    ).toBe(true)
    expect(
      WebSocketJsonRpcRequestSchema.safeParse({
        id: 1,
        jsonrpc: '2.0',
        method: 'eth_chainId',
        params: [],
        __frameOrigin: 'https://app.example',
        __frameFavicon: 'https://app.example/favicon.png',
        __extensionConnecting: true
      }).success
    ).toBe(true)
    expect(
      RoutedJsonRpcRequestSchema.safeParse({
        id: 1,
        jsonrpc: '2.0',
        method: 'eth_chainId',
        params: [],
        pollId: 'poll-1'
      }).success
    ).toBe(false)
  })

  it('rejects invalid versions, null params, and unknown fields', () => {
    expect(
      JsonRpcRequestSchema.safeParse({ id: 1, jsonrpc: '1.0', method: 'eth_chainId', params: [] }).success
    ).toBe(false)
    expect(
      JsonRpcRequestSchema.safeParse({ id: 1, jsonrpc: '2.0', method: 'eth_chainId', params: null }).success
    ).toBe(false)
    expect(
      JsonRpcRequestSchema.safeParse({
        id: 1,
        jsonrpc: '2.0',
        method: 'eth_chainId',
        params: [],
        extra: true
      }).success
    ).toBe(false)
  })
})

describe('JSON-RPC responses', () => {
  it('accepts canonical success and error responses', () => {
    expect(JsonRpcResponseSchema.parse({ id: 1, jsonrpc: '2.0', result: '0x1' })).toEqual({
      id: 1,
      jsonrpc: '2.0',
      result: '0x1'
    })
    expect(
      JsonRpcResponseSchema.safeParse({
        id: 'request-1',
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal error', data: { retry: false } }
      }).success
    ).toBe(true)
  })

  it('rejects malformed and ambiguous response envelopes', () => {
    const invalid = [
      { id: 1, method: 'eth_chainId', result: '0x1' },
      { id: 1, result: '0x1' },
      { id: 1, jsonrpc: '2.0', result: '0x1', error: { code: -32603, message: 'failed' } },
      { id: 1, jsonrpc: '2.0', error: { code: 1.5, message: 'failed' } },
      { id: 1, jsonrpc: '2.0', result: '0x1', extra: true }
    ]

    invalid.forEach((payload) => expect(JsonRpcResponseSchema.safeParse(payload).success).toBe(false))
  })
})

describe('Ethereum subscriptions', () => {
  it('accepts only exact eth_subscription notifications', () => {
    const notification = {
      jsonrpc: '2.0',
      method: 'eth_subscription',
      params: { subscription: '0xsub', result: { number: '0x1' } }
    }

    expect(EthSubscriptionNotificationSchema.safeParse(notification).success).toBe(true)
    expect(JsonRpcResponseOrNotificationSchema.safeParse(notification).success).toBe(true)
    expect(
      EthSubscriptionNotificationSchema.safeParse({
        ...notification,
        params: { result: { number: '0x1' } }
      }).success
    ).toBe(false)
    expect(
      EthSubscriptionNotificationSchema.safeParse({ ...notification, method: 'chainChanged' }).success
    ).toBe(false)
  })

  it('extracts only supported request ids from malformed messages', () => {
    expect(extractJsonRpcId({ id: 'request-1', method: 'eth_chainId' })).toBe('request-1')
    expect(extractJsonRpcId({ id: null })).toBeUndefined()
    expect(extractJsonRpcId([])).toBeUndefined()
  })
})
