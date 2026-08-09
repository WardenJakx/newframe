import { describe, expect, it } from 'bun:test'

import { NATIVE_CURRENCY } from '../../../tokens/domain/constants'
import { filterSendRecipients, projectSendSubmission, selectSendAsset } from './sendModel'
import type { BalanceSummary } from '../../../asset-data/domain/balance'
import type { OperationRecord } from '../../../../platform/operations/operation'
import type { SideTrayRendererState } from '../../../../platform/state-sync/contract/projections'

const sender = { id: 'sender', address: `0x${'1'.repeat(40)}`, name: 'Sender' }
const recipient = { id: 'recipient', address: `0x${'2'.repeat(40)}`, name: 'Recipient' }

function balance(address: string): BalanceSummary {
  return {
    address,
    balance: '1',
    chainId: 1,
    decimals: 18,
    displayBalance: '1',
    hasPrice: false,
    name: address === NATIVE_CURRENCY ? 'Ether' : 'Token',
    symbol: address === NATIVE_CURRENCY ? 'ETH' : 'TKN',
    totalValue: 0,
    unformattedBalance: 1
  }
}

describe('sendModel', () => {
  it('selects canonical route assets and falls back to the first sendable balance', () => {
    const native = balance(NATIVE_CURRENCY)
    const token = balance(`0x${'a'.repeat(40)}`)

    expect(selectSendAsset([native, token], `1:${token.address}`)).toBe(token)
    expect(selectSendAsset([native], `1:${token.address}`)).toBe(native)
    expect(selectSendAsset([], null)).toBeNull()
  })

  it('excludes the current account and duplicate sender addresses from recipients', () => {
    expect(
      filterSendRecipients(
        [sender, { ...recipient, id: 'duplicate', address: sender.address.toUpperCase() }, recipient],
        sender
      )
    ).toEqual([recipient])
  })

  it('correlates submission operations with projected transaction activity', () => {
    const operationId = 'operation-1'
    const transactionId = `0x${'a'.repeat(64)}`
    const operation = {
      id: operationId,
      type: 'send.submit',
      status: 'succeeded',
      phase: 'submitted',
      entityRefs: [{ type: 'transaction', id: transactionId }],
      startedAt: 1,
      updatedAt: 2,
      finishedAt: 2
    } satisfies OperationRecord
    const activity = {
      id: transactionId,
      status: 'succeeded'
    } satisfies SideTrayRendererState['activity'][string]

    expect(
      projectSendSubmission({ activity: {}, operationId, operations: { [operationId]: operation } })
    ).toEqual({
      error: '',
      status: 'Confirm in Newframe',
      submitting: true
    })
    expect(
      projectSendSubmission({
        activity: { [transactionId]: activity },
        operationId,
        operations: { [operationId]: operation }
      })
    ).toEqual({ error: '', status: 'Transaction submitted', submitting: false })
  })
})
