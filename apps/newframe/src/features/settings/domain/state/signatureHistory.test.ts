import { expect, it } from 'bun:test'

import type { SignatureRequest } from '../../../requests/contract/requests'
import { SignatureHistoryItemSchema, signatureHistoryItem } from './signatureHistory'

const account = '0x1111111111111111111111111111111111111111'

it('records the exact signing account and classifies sign-in messages', () => {
  const request: SignatureRequest = {
    handlerId: 'request-1',
    type: 'sign',
    account,
    origin: 'app.example',
    chainId: 1,
    payload: { id: 1, jsonrpc: '2.0', method: 'personal_sign', params: [] },
    data: { decodedMessage: 'app.example wants you to sign in with your Ethereum account:\n0x1111' }
  }
  const item = signatureHistoryItem(request, '0x1234', {
    origin: 'app.example',
    network: 'Ethereum',
    signedAt: '2026-09-27T12:00:00.000Z'
  })

  expect(SignatureHistoryItemSchema.parse(item)).toEqual({
    id: 'request-1',
    accountId: account,
    origin: 'app.example',
    kind: 'sign-in',
    signedAt: '2026-09-27T12:00:00.000Z',
    summary: 'Sign in with Ethereum',
    message: request.data.decodedMessage,
    signature: '0x1234',
    network: 'Ethereum'
  })
})

it('keeps oversized signed content bounded for local persistence', () => {
  const request: SignatureRequest = {
    handlerId: 'request-large',
    type: 'sign',
    account,
    origin: 'app.example',
    chainId: 1,
    payload: { id: 2, jsonrpc: '2.0', method: 'personal_sign', params: [] },
    data: { decodedMessage: 'x'.repeat(70_000) }
  }
  const item = signatureHistoryItem(request, `0x${'a'.repeat(20_000)}`, {
    origin: 'app.example',
    signedAt: '2026-09-27T12:00:00.000Z'
  })

  expect(item.message).toHaveLength(65_536)
  expect(item.signature).toHaveLength(16_384)
  expect(SignatureHistoryItemSchema.safeParse(item).success).toBe(true)
})
