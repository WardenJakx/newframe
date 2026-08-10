import { expect, it, mock } from 'bun:test'

import type { NewframeHost } from '../../../platform/ipc/contract/ipc'
import type { CommandResult } from '../../../app/contracts/operations'
import { createRequestRendererCapabilities as createRequestPorts } from './requestCapabilities'

it('maps each request surface to its exact host command and preserves failures', async () => {
  const executeCommand = mock(async (_command: unknown): Promise<CommandResult> => ({ ok: true }))
  const capabilities = createRequestPorts({ executeCommand } as Pick<NewframeHost, 'executeCommand'>)

  await capabilities.panel.back({ steps: 1 })
  await capabilities.panel.openRequest({ requestId: 'request-1' })
  await capabilities.review.clearOrigin({ accountId: '0xabc', originId: 'origin-1' })
  await capabilities.review.resolveAccess({ requestId: 'request-1', approved: true })
  await capabilities.review.resolveAgentAccess({ requestId: 'request-1', approved: false })
  await capabilities.review.reviewAddChain({ requestId: 'request-1' })
  await capabilities.review.reviewAddToken({ requestId: 'request-1' })
  await capabilities.review.confirmWarning({ requestId: 'request-1', gate: 'gas-fee' })
  await capabilities.review.resolveSwitchChain({ requestId: 'request-1', approved: true })
  await capabilities.review.reject({ requestId: 'request-1' })
  await capabilities.review.approve({ requestId: 'request-1' })
  await capabilities.review.confirmApproval({
    requestId: 'request-1',
    approvalType: 'approveGasLimit'
  })
  await capabilities.review.updateTokenApproval({
    requestKind: 'transaction',
    requestId: 'request-1',
    actionId: 'erc20:approve',
    amount: '10'
  })
  await capabilities.transaction.updateFee({
    requestId: 'request-1',
    field: 'gasLimit',
    value: '0x5208'
  })
  await capabilities.transaction.setDefaultFee({ requestId: 'request-1', level: 'fast' })
  await capabilities.transaction.replace({
    requestId: 'request-1',
    replacement: 'speed',
    idempotencyKey: 'replace-1'
  })
  await capabilities.transaction.dismissFeeNotice({ requestId: 'request-1' })
  await capabilities.external.copy({ text: '0xhash' })
  await capabilities.external.openExplorer({ chainId: 1, transactionHash: '0xhash' })
  await capabilities.external.writeText('copy text')
  await capabilities.external.hydrateTokenImage('1:0x1111111111111111111111111111111111111111')

  expect(executeCommand.mock.calls.map(([command]) => command)).toEqual([
    { type: 'panel.back', steps: 1 },
    { type: 'panel.request-open', requestId: 'request-1' },
    { type: 'request.clear-origin', accountId: '0xabc', originId: 'origin-1' },
    { type: 'request.access-resolve', requestId: 'request-1', approved: true },
    { type: 'request.agent-access-resolve', requestId: 'request-1', approved: false },
    { type: 'request.add-chain-review', requestId: 'request-1' },
    { type: 'request.add-token-review', requestId: 'request-1' },
    { type: 'request.warning-confirm', requestId: 'request-1', gate: 'gas-fee' },
    { type: 'request.switch-chain-resolve', requestId: 'request-1', approved: true },
    { type: 'request.reject', requestId: 'request-1' },
    { type: 'request.approve', requestId: 'request-1' },
    {
      type: 'request.approval-confirm',
      requestId: 'request-1',
      approvalType: 'approveGasLimit'
    },
    {
      type: 'request.token-approval-update',
      requestKind: 'transaction',
      requestId: 'request-1',
      actionId: 'erc20:approve',
      amount: '10'
    },
    {
      type: 'transaction.fee-update',
      requestId: 'request-1',
      field: 'gasLimit',
      value: '0x5208'
    },
    { type: 'transaction.fee-default-set', requestId: 'request-1', level: 'fast' },
    {
      type: 'transaction.replace',
      requestId: 'request-1',
      replacement: 'speed',
      idempotencyKey: 'replace-1'
    },
    { type: 'transaction.fee-notice-dismiss', requestId: 'request-1' },
    { type: 'clipboard.write', text: '0xhash' },
    { type: 'explorer.open', chainId: 1, transactionHash: '0xhash' },
    { type: 'clipboard.write', text: 'copy text' },
    { type: 'token.image-hydrate', tokenId: '1:0x1111111111111111111111111111111111111111' }
  ])

  executeCommand.mockResolvedValueOnce({ ok: false, error: 'operation_failed' })
  await expect(capabilities.review.reject({ requestId: 'request-2' })).resolves.toEqual({
    ok: false,
    error: 'operation_failed'
  })
})
