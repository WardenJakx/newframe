import { expect, it } from 'bun:test'

import type { SignatureRequest } from '../../requests/contract/requests'
import type { Account } from '../domain/state/account'
import { deriveSigningCapability } from './signingCapability'

const profileId = 'profile-1'
const safeAddress = `0x${'a'.repeat(40)}`

const safeAccount: Account = {
  id: safeAddress,
  profileId,
  address: safeAddress,
  name: 'Safe',
  lastSignerType: 'Address',
  status: 'ok',
  signer: '',
  safe: {},
  requests: {},
  created: 'test:1'
}

const request: SignatureRequest = {
  handlerId: 'request-1',
  type: 'sign',
  origin: 'example.test',
  payload: {
    id: 1,
    jsonrpc: '2.0',
    method: 'personal_sign',
    params: [safeAddress, '0x01']
  },
  account: safeAddress,
  chainId: 1,
  data: { decodedMessage: '0x01' }
}

it('marks Safe signing unavailable when the request chain has no configured deployment', () => {
  expect(deriveSigningCapability(request, [safeAccount], {}, { locked: false }, profileId)).toEqual({
    type: 'safe',
    status: 'unavailable',
    chainId: 1,
    configured: false,
    threshold: 0,
    coordination: 'service',
    candidates: []
  })
})
