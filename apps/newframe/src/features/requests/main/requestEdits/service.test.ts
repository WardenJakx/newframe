import { expect, it, mock } from 'bun:test'

import { createRequestEditService } from './service'

it('revalidates the selected token approval before updating it', () => {
  const request = { type: 'transaction', recognizedActions: [{ id: 'erc20:approve' }] }
  const updateRequest = mock(() => true)
  const service = createRequestEditService({
    accounts: {
      current: () => ({ getRequest: (id: string) => (id === 'request-1' ? request : undefined) }),
      updateRequest
    } as never
  })
  const command = {
    type: 'request.token-approval-update',
    requestKind: 'transaction',
    requestId: 'request-1',
    actionId: 'erc20:approve',
    amount: '10'
  } as const
  expect(service.updateTokenApproval({ ...command, requestId: 'missing' })).toBeFalse()
  expect(service.updateTokenApproval(command)).toBeTrue()
  expect(updateRequest).toHaveBeenCalledWith('request-1', { amount: '10' }, 'erc20:approve')
})
