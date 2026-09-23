import { expect, it, mock } from 'bun:test'

import type {
  CommandResult,
  QueryMap,
  QueryResultMap,
  ResultForQuery
} from '../../../app/contracts/operations'
import type { NewframeHost } from '../../../platform/ipc/contract/ipc'
import { createRequestRendererCapabilities as createRequestPorts } from './requestCapabilities'

it('maps each request surface to its exact host command and preserves failures', async () => {
  const executeCommand = mock(async (_command: unknown): Promise<CommandResult> => ({ ok: true }))
  const capabilities = createRequestPorts({
    executeCommand,
    executeQuery: async () => ({ ok: false, error: 'unauthorized' })
  })

  await capabilities.panel.back({ steps: 1 })
  await capabilities.panel.openRequest({ requestId: 'request-1' })
  await capabilities.review.clearOrigin({ accountId: '0xabc', originId: 'origin-1' })
  await capabilities.review.resolveAccess({ requestId: 'request-1', approved: true })
  await capabilities.review.resolveAgentAccess({ requestId: 'request-1', approved: false })
  await capabilities.review.resolveAddChain({ requestId: 'request-1', approved: true })
  await capabilities.review.reviewAddChain({ requestId: 'request-1' })
  await capabilities.review.reviewAddToken({ requestId: 'request-1' })
  await capabilities.review.confirmWarning({ requestId: 'request-1', gate: 'gas-fee' })
  await capabilities.review.resolveSwitchChain({ requestId: 'request-1', approved: true })
  await capabilities.review.reject({ requestId: 'request-1' })
  await capabilities.review.approve({ requestId: 'request-1' })
  await capabilities.safe.refresh({ accountId: '0xabc' })
  const safe = {
    accountId: '0xabc',
    ownerId: '0xdef',
    chainId: 1,
    safeTxHash: '0xhash',
    operationId: 'safe-1'
  }
  await capabilities.safe.confirm(safe)
  await capabilities.safe.execute({
    action: 'execute-safe',
    operationId: 'safe-execute',
    accountId: safe.accountId,
    executorId: safe.ownerId,
    chainId: safe.chainId,
    safeTxHash: safe.safeTxHash
  })
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
  await capabilities.transaction.setFeePreference({ chainId: 1, level: 'fast' })
  await capabilities.transaction.replace({
    requestId: 'request-1',
    replacement: 'speed',
    idempotencyKey: 'replace-1'
  })
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
    { type: 'network.request-resolve', requestId: 'request-1', approved: true },
    { type: 'request.add-chain-review', requestId: 'request-1' },
    { type: 'request.add-token-review', requestId: 'request-1' },
    { type: 'request.warning-confirm', requestId: 'request-1', gate: 'gas-fee' },
    { type: 'request.switch-chain-resolve', requestId: 'request-1', approved: true },
    { type: 'request.reject', requestId: 'request-1' },
    { type: 'request.approve', requestId: 'request-1' },
    { type: 'account.refresh', accountId: '0xabc' },
    { type: 'request.approve', ...safe },
    {
      type: 'request.approve',
      action: 'execute-safe',
      operationId: 'safe-execute',
      accountId: safe.accountId,
      executorId: safe.ownerId,
      chainId: safe.chainId,
      safeTxHash: safe.safeTxHash
    },
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
    { type: 'settings.update', setting: 'gas-fee-level', chainId: 1, value: 'fast' },
    {
      type: 'transaction.replace',
      requestId: 'request-1',
      replacement: 'speed',
      idempotencyKey: 'replace-1'
    },
    { type: 'clipboard.write', text: '0xhash' },
    { type: 'explorer.open', chainId: 1, transactionHash: '0xhash' },
    { type: 'clipboard.write', text: 'copy text' },
    { type: 'token.image-hydrate', tokenId: '1:0x1111111111111111111111111111111111111111' }
  ])

  executeCommand.mockResolvedValueOnce({ ok: false, error: 'operation_failed' })
  expect(capabilities.review.reject({ requestId: 'request-2' })).resolves.toEqual({
    ok: false,
    error: 'operation_failed'
  })
})

it('queries the selected Safe proposal and converts query boundary failures into unavailable previews', async () => {
  const result: QueryResultMap['safe.simulate'] = {
    status: 'success',
    effects: [],
    assumptions: [],
    currentNonce: '3',
    blockNumber: '100'
  }
  const executeQuery = mock(
    async (_query: QueryMap['safe.simulate']): Promise<ResultForQuery<QueryMap['safe.simulate']>> => result
  )
  const capabilities = createRequestPorts({
    executeCommand: async () => ({ ok: true }),
    executeQuery: executeQuery as NewframeHost['executeQuery']
  })
  const input = { accountId: `0x${'1'.repeat(40)}`, chainId: 1, safeTxHash: `0x${'a'.repeat(64)}` }
  expect(await capabilities.safe.simulate(input)).toEqual(result)
  expect(executeQuery).toHaveBeenCalledWith({ type: 'safe.simulate', ...input })
  executeQuery.mockResolvedValueOnce({ ok: false, error: 'unauthorized' })
  expect(await capabilities.safe.simulate(input)).toEqual({
    status: 'unavailable',
    error: 'Could not load Safe preview.'
  })
})

it('maps Safe execution preparation to the typed query boundary', async () => {
  const failure: QueryResultMap['safe.execution-prepare'] = { ok: false, error: 'Not executable' }
  const executeQuery = mock(async () => failure)
  const capabilities = createRequestPorts({
    executeCommand: async () => ({ ok: true }),
    executeQuery: executeQuery as NewframeHost['executeQuery']
  })
  const input = {
    accountId: `0x${'1'.repeat(40)}`,
    executorId: `0x${'2'.repeat(40)}`,
    chainId: 1,
    safeTxHash: `0x${'a'.repeat(64)}`
  }
  expect(await capabilities.safe.prepareExecution(input)).toEqual(failure)
  expect(executeQuery).toHaveBeenCalledWith({ type: 'safe.execution-prepare', ...input })
})
