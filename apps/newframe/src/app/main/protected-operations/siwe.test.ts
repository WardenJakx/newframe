import { expect, it, mock } from 'bun:test'

import { getBytes, Wallet } from 'ethers'

import { encodePersonalSignMessage } from '../../../features/connections/main/provider/helpers'
import type { SignatureRequest } from '../../../features/requests/contract/requests'
import { RequestStatus } from '../../../features/requests/contract/requests'
import type { SigningApprovalContext } from '../../../platform/signing/signers/Signer'
import { createAiSessionClientSource } from '../gateway/requestSource'
import { ProtectedOperationsService } from './service'

const wallet = new Wallet(`0x${'11'.repeat(32)}`)
const account = wallet.address.toLowerCase()

function message(domain = 'example.test', address = wallet.address) {
  return `${domain} wants you to sign in with your Ethereum account:\n${address}\n\nSign in.\n\nURI: https://example.test/login\nVersion: 1\nChain ID: 1\nNonce: abcdefgh\nIssued At: 2026-10-03T12:00:00Z`
}

function fixture(rawMessage: string, websiteOrigin?: string) {
  const request: Extract<SignatureRequest, { type: 'sign' }> = {
    type: 'sign',
    handlerId: 'request',
    account,
    origin: 'example.test',
    chainId: 1,
    status: RequestStatus.Pending,
    payload: { id: 1, jsonrpc: '2.0', method: 'personal_sign', params: [account, rawMessage] },
    data: { decodedMessage: 'Untrusted display text must not determine what is signed.' },
    authorization: {
      actionId: 'action',
      decision: 'prompt',
      decidedAt: 1,
      principal: {
        kind: 'rpc',
        transport: 'http',
        connectionId: 'connection',
        origin: 'example.test',
        websiteOrigin
      },
      intent: { requestType: 'sign', account, method: 'personal_sign' }
    }
  }
  const signMessage = mock(
    (_address: string, _message: string, _callback: Callback<string>, _context?: SigningApprovalContext) => {}
  )
  const agentSignMessage = mock(
    (_message: string, _callback: Callback<string>, _context?: SigningApprovalContext) => {}
  )
  const service = new ProtectedOperationsService(
    { signMessage, getFrameAccount: () => ({ id: account, signMessage: agentSignMessage }) } as never,
    {} as never,
    {
      getState: () => ({
        main: { currentAccount: account, origins: {}, accounts: { [account]: { requests: { request } } } }
      })
    } as never,
    () => undefined
  )
  return { service, request, signMessage, agentSignMessage }
}

it.each([
  ['domain', 'https://attacker.test', message()],
  ['scheme', 'http://example.test', message()],
  ['port', 'https://example.test:8443', message()],
  ['unknown origin', undefined, message()],
  [
    'signing address',
    'https://example.test',
    message('example.test', '0x1111111111111111111111111111111111111111')
  ]
] as const)('rejects a SIWE %s mismatch before invoking the signer', (_kind, origin, rawMessage) => {
  const test = fixture(encodePersonalSignMessage(rawMessage), origin)
  const callback = mock((_error?: Error | null, _signature?: string) => {})
  test.service.approveSign(test.request, callback)
  expect(test.signMessage).not.toHaveBeenCalled()
  expect(callback).toHaveBeenCalledTimes(1)
  expect(callback.mock.calls[0][0]).toMatchObject({ code: 4001 })
})

it('signs the original plaintext SIWE bytes after verifying its transport origin', async () => {
  const rawMessage = message()
  const test = fixture(rawMessage, 'https://example.test')
  const callback = mock((_error?: Error | null, _signature?: string) => {})
  test.service.approveSign(test.request, callback)
  const [address, encoded, complete, approval] = test.signMessage.mock.calls[0]
  expect(address).toBe(account)
  expect(encoded).toBe(encodePersonalSignMessage(rawMessage))
  expect(approval?.isActive()).toBeTrue()
  const signature = await wallet.signMessage(getBytes(encoded))
  complete(null, signature)
  expect(callback).toHaveBeenCalledWith(null, signature)
})

it('permits generic personal_sign and malformed SIWE messages for user review', () => {
  for (const rawMessage of ['hello', 'example.test wants you to sign in with your Ethereum account:']) {
    const test = fixture(rawMessage)
    test.service.approveSign(test.request, mock())
    expect(test.signMessage).toHaveBeenCalledTimes(1)
  }
})

it('prevents autonomous SIWE signing without a trusted browser origin', () => {
  const test = fixture(message(), 'https://example.test')
  const source = createAiSessionClientSource({
    sessionId: 'session',
    accountId: account,
    expiresAt: Date.now() + 60_000,
    isActive: () => true
  })
  const respond = mock((_response: RPCResponsePayload) => {})
  test.service.signAiSessionMessage(
    encodePersonalSignMessage(message()),
    test.request.payload as RPCRequestPayload,
    source,
    respond
  )
  expect(test.agentSignMessage).not.toHaveBeenCalled()
  expect(respond).toHaveBeenCalledTimes(1)
  expect(respond.mock.calls[0][0]).toMatchObject({ error: { code: 4001 } })
})
