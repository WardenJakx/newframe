import { expect, it, mock } from 'bun:test'
import type { Mock } from 'bun:test'

import { NATIVE_CURRENCY } from '../../../domain/token/constants'
import type { TrustedPrincipal } from '../../authority'
import { createTestStore } from '../../../test/support/createTestStore'
import { createOperationService } from '../operations/service'
import { createSendService, type SendCanonicalSnapshot, type SendServicePorts } from './service'

const senderAddress = '0x0000000000000000000000000000000000000001'
const recipientAddress = '0x0000000000000000000000000000000000000002'
const tokenAddress = '0x00000000000000000000000000000000000000bb'
const hash = `0x${'a'.repeat(64)}`
const owner = { clientType: 'sidetray' as const, windowInstanceId: 'send-window' }
const principal = { kind: 'renderer' } as unknown as TrustedPrincipal
const flush = () => new Promise((resolve) => setImmediate(resolve))

function snapshot(): SendCanonicalSnapshot {
  return {
    currentAccount: 'sender',
    accounts: { sender: { id: 'sender', address: senderAddress } },
    balances: {
      [senderAddress]: [
        { address: NATIVE_CURRENCY, balance: '0xde0b6b3a7640000', chainId: 1 },
        { address: tokenAddress, balance: '2000000', chainId: 1 }
      ]
    },
    networks: { 1: { on: true } },
    tokens: {
      [`1:${tokenAddress}`]: {
        address: tokenAddress,
        chainId: 1,
        decimals: 6,
        name: 'Mock USD Coin',
        symbol: 'USDC'
      }
    }
  }
}

function harness(
  submit: SendServicePorts['transactions']['submit'] = mock(async () => ({
    ok: true as const,
    transactionHash: hash
  })),
  resolve: SendServicePorts['names']['resolve'] = mock(async () => recipientAddress)
) {
  const testStore = createTestStore()
  let now = 1
  const state = snapshot()
  const operations = createOperationService({
    store: testStore.store,
    clock: { now: () => now++ }
  })
  const service = createSendService({
    canonical: { snapshot: () => state },
    clock: { now: () => now++ },
    idempotency: new Map(),
    names: { resolve },
    operations,
    transactions: { submit }
  })
  const operation = (id: string) => testStore.getState().operations[id]?.operation
  return { operation, resolve, service, state, submit }
}

const nativeCommand = (operationId: string) => ({
  type: 'send.submit' as const,
  operationId,
  asset: { address: NATIVE_CURRENCY, chainId: 1 },
  amount: '1000000000000000000',
  recipient: recipientAddress
})

it('owns validated, idempotent native, token, and name sends and settles every stale or shutdown path', async () => {
  {
    const { operation, service, submit } = harness()
    expect(service.submit(nativeCommand('native'), principal, owner)).toBeTrue()
    await flush()
    expect((submit as Mock<any>).mock.calls[0]).toEqual([
      {
        chainId: 1,
        idempotencyKey: 'native',
        transaction: { to: recipientAddress, value: '0xde0b6b3a7640000' }
      },
      principal
    ])
    expect(operation('native')).toMatchObject({
      status: 'succeeded',
      phase: 'submitted',
      entityRefs: expect.arrayContaining([
        { type: 'account', id: 'sender' },
        { type: 'transaction', id: hash }
      ])
    })
  }

  {
    const { operation, resolve, service, submit } = harness()
    const command = {
      type: 'send.submit' as const,
      operationId: 'token-name',
      asset: { address: tokenAddress, chainId: 1 },
      amount: '1000000',
      recipient: 'alice.eth'
    }
    expect(service.submit(command, principal, owner)).toBeTrue()
    await flush()
    expect((resolve as Mock<any>).mock.calls).toEqual([['alice.eth']])
    expect((submit as Mock<any>).mock.calls[0]?.[0]).toEqual({
      chainId: 1,
      idempotencyKey: 'token-name',
      tokenData: { decimals: 6, name: 'Mock USD Coin', symbol: 'USDC' },
      transaction: {
        to: tokenAddress,
        value: '0x0',
        data:
          '0xa9059cbb' +
          '0000000000000000000000000000000000000000000000000000000000000002' +
          '00000000000000000000000000000000000000000000000000000000000f4240'
      }
    })
    expect(operation('token-name')?.status).toBe('succeeded')
  }

  {
    let resolveName: (address: string) => void = () => undefined
    const deferred = new Promise<string>((resolve) => {
      resolveName = resolve
    })
    const { operation, service, state, submit } = harness(undefined, () => deferred)
    service.submit({ ...nativeCommand('stale-account'), recipient: 'alice.eth' }, principal, owner)
    await flush()
    state.currentAccount = 'other'
    state.accounts.other = { id: 'other', address: recipientAddress }
    resolveName(recipientAddress)
    await flush()
    expect(operation('stale-account')).toMatchObject({
      status: 'failed',
      error: { code: 'account_changed' }
    })
    expect((submit as Mock<any>).mock.calls).toEqual([])
  }

  {
    let resolveName: (address: string) => void = () => undefined
    const deferred = new Promise<string>((resolve) => {
      resolveName = resolve
    })
    const { operation, service, state, submit } = harness(undefined, () => deferred)
    service.submit({ ...nativeCommand('balance-changed'), recipient: 'alice.eth' }, principal, owner)
    await flush()
    state.balances[senderAddress]![0].balance = '0x1'
    resolveName(recipientAddress)
    await flush()
    expect(operation('balance-changed')).toMatchObject({
      status: 'failed',
      error: { code: 'insufficient_balance' }
    })
    expect((submit as Mock<any>).mock.calls).toEqual([])
  }

  {
    let resolveName: (address: string) => void = () => undefined
    const deferred = new Promise<string>((resolve) => {
      resolveName = resolve
    })
    const { operation, service, state, submit } = harness(undefined, () => deferred)
    service.submit({ ...nativeCommand('network-changed'), recipient: 'alice.eth' }, principal, owner)
    await flush()
    state.networks[1]!.on = false
    resolveName(recipientAddress)
    await flush()
    expect(operation('network-changed')).toMatchObject({
      status: 'failed',
      error: { code: 'network_unavailable' }
    })
    expect((submit as Mock<any>).mock.calls).toEqual([])
  }

  {
    const { operation, service, submit } = harness()
    const command = nativeCommand('idempotent')
    expect(service.submit(command, principal, owner)).toBeTrue()
    expect(service.submit(command, principal, owner)).toBeTrue()
    expect(service.submit({ ...command, amount: '2' }, principal, owner)).toBeFalse()
    await flush()
    expect((submit as Mock<any>).mock.calls).toHaveLength(1)
    expect(operation('idempotent')?.status).toBe('succeeded')
  }

  {
    const providerFailure = mock(async () => ({
      ok: false as const,
      error: 'provider_error',
      message: 'Transaction failed.'
    }))
    const { operation, service } = harness(providerFailure)
    service.submit(nativeCommand('provider-error'), principal, owner)
    await flush()
    expect(operation('provider-error')).toMatchObject({
      status: 'failed',
      error: { code: 'provider_error', message: 'Transaction failed.' }
    })
  }

  {
    const { operation, service, submit } = harness()
    service.submit(nativeCommand('shutdown'), principal, owner)
    service.dispose()
    await flush()
    expect(operation('shutdown')).toMatchObject({
      status: 'failed',
      error: { code: 'application_shutdown' }
    })
    expect((submit as Mock<any>).mock.calls).toEqual([])
    expect(service.submit(nativeCommand('after-shutdown'), principal, owner)).toBeFalse()
  }
})
