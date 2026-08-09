import { describe, expect, it, mock } from 'bun:test'

import { createRequestEditService } from './service'

describe('request edit service', () => {
  it('revalidates the current request and delegates each edit through canonical account capabilities', async () => {
    const request = {
      type: 'transaction',
      data: { chainId: 1, type: '0x0', gasPrice: '0x10' },
      recognizedActions: [{ id: 'erc20:approve' }],
      feesUpdatedByUser: true
    }
    const setGasDefault = mock()
    const setGasPrice = mock()
    const updateRequest = mock((_requestId: string, _data: unknown, _actionId: string) => true)
    const adjustNonce = mock()
    const resetNonce = mock()
    const removeFeeUpdateNotice = mock(async (_id: string) => undefined)
    const account = {
      getRequest: (id: string) => (id === 'request-1' ? request : undefined),
      patchRequest: (_id: string, update: (value: typeof request) => void) => update(request)
    }
    const service = createRequestEditService({
      accounts: {
        current: () => account,
        updateRequest,
        setBaseFee: mock(),
        setPriorityFee: mock(),
        setGasPrice,
        setGasLimit: mock(),
        adjustNonce,
        resetNonce
      } as never,
      feeNotices: { remove: removeFeeUpdateNotice },
      store: {
        getState: () => ({
          main: {
            networks: { ethereum: { 1: { id: 1 } } },
            networksMeta: {
              ethereum: { 1: { gas: { price: { levels: { standard: '0x64' } } } } }
            }
          },
          setGasDefault
        })
      } as never
    })

    expect(service.updateTransactionFee('missing', 'gasPrice', '0x20')).toBeFalse()
    expect(service.updateTransactionFee('request-1', 'gasPrice', '0x20')).toBeTrue()
    expect(service.setTransactionFeeDefault('request-1', 'standard')).toBeTrue()
    expect(request.feesUpdatedByUser).toBeFalse()
    expect(service.adjustTransactionNonce('request-1', 1)).toBeTrue()
    expect(service.resetTransactionNonce('request-1')).toBeTrue()
    expect(
      service.updateTokenApproval({
        type: 'request.token-approval-update',
        requestKind: 'transaction',
        requestId: 'request-1',
        actionId: 'erc20:approve',
        amount: '10'
      })
    ).toBeTrue()
    expect(await service.dismissTransactionFeeNotice('request-1')).toBeTrue()
    expect({
      adjust: adjustNonce.mock.calls,
      dismiss: removeFeeUpdateNotice.mock.calls.length,
      gasDefault: setGasDefault.mock.calls,
      gasPrice: setGasPrice.mock.calls,
      reset: resetNonce.mock.calls,
      tokenApproval: updateRequest.mock.calls
    }).toEqual({
      adjust: [['request-1', 1]],
      dismiss: 1,
      gasDefault: [['ethereum', 1, 'standard', '0x64']],
      gasPrice: [
        ['0x20', 'request-1', true],
        ['0x64', 'request-1', true]
      ],
      reset: [['request-1']],
      tokenApproval: [['request-1', { amount: '10' }, 'erc20:approve']]
    })
  })
})
