import type { AccountRequest, PermitSignatureRequest, TransactionRequest } from '../../contract/requests.js'
import type { RequestTokenApprovalUpdateCommand } from '../../../../app/contracts/operations.js'
import { usesBaseFee } from '../../../transactions/domain/index.js'
import { toBigInt } from '../../../../shared/domain/units.js'
import type { Accounts } from '../../../accounts/main/index.js'
import type { CanonicalStore } from '../../../../platform/state-store/actions.js'

type RequestEditState = Pick<CanonicalStore, 'main' | 'setGasDefault'>

export interface RequestEditServicePorts {
  accounts: Pick<
    Accounts,
    | 'adjustNonce'
    | 'current'
    | 'resetNonce'
    | 'setBaseFee'
    | 'setGasLimit'
    | 'setGasPrice'
    | 'setPriorityFee'
    | 'updateRequest'
  >
  feeNotices: { remove(requestId: string): Promise<void> }
  store: { getState(): RequestEditState }
}

export function createRequestEditService(ports: RequestEditServicePorts) {
  const currentRequest = <T extends AccountRequest = AccountRequest>(requestId: string) =>
    ports.accounts.current()?.getRequest<T>(requestId)

  return {
    updateTokenApproval(command: RequestTokenApprovalUpdateCommand) {
      if (command.requestKind === 'transaction') {
        const request = currentRequest<TransactionRequest>(command.requestId)
        const action = request?.recognizedActions?.find((candidate) => candidate.id === command.actionId)
        if (request?.type !== 'transaction' || !action) return false

        return ports.accounts.updateRequest(command.requestId, { amount: command.amount }, command.actionId)
      }

      const request = currentRequest<PermitSignatureRequest>(command.requestId)
      if (request?.type !== 'signErc20Permit') return false

      return ports.accounts.updateRequest(
        command.requestId,
        {
          typedMessage: {
            ...request.typedMessage,
            data: {
              ...request.typedMessage.data,
              message: { ...request.typedMessage.data.message, value: command.amount }
            }
          },
          permit: { ...request.permit, value: command.amount },
          tokenData: request.tokenData
        },
        'erc20:approve'
      )
    },

    updateTransactionFee(
      requestId: string,
      field: 'baseFee' | 'priorityFee' | 'gasPrice' | 'gasLimit',
      value: string
    ) {
      if (currentRequest(requestId)?.type !== 'transaction') return false

      const setters = {
        baseFee: ports.accounts.setBaseFee.bind(ports.accounts),
        priorityFee: ports.accounts.setPriorityFee.bind(ports.accounts),
        gasPrice: ports.accounts.setGasPrice.bind(ports.accounts),
        gasLimit: ports.accounts.setGasLimit.bind(ports.accounts)
      }
      setters[field](value, requestId, true)
      return true
    },

    setTransactionFeeDefault(requestId: string, level: 'asap' | 'fast' | 'standard' | 'slow') {
      const request = currentRequest<TransactionRequest>(requestId)
      if (request?.type !== 'transaction') return false

      const state = ports.store.getState()
      const chainId = Number(request.data.chainId)
      const network = state.main.networks.ethereum[chainId]
      const gasPrice = state.main.networksMeta.ethereum[chainId]?.gas?.price
      const levelValue = gasPrice?.levels?.[level]
      if (!network || levelValue === undefined) return false

      state.setGasDefault('ethereum', chainId, level, levelValue)
      const multiplier = { asap: 150n, fast: 125n, standard: 100n, slow: 85n }[level]
      const scale = (value: bigint) => (value * multiplier) / 100n
      const toHex = (value: bigint) => `0x${value.toString(16)}`

      if (usesBaseFee(request.data)) {
        const currentPriority = toBigInt(request.data.maxPriorityFeePerGas) ?? 0n
        const currentMax = toBigInt(request.data.maxFeePerGas) ?? 0n
        const currentBase = currentMax > currentPriority ? currentMax - currentPriority : 0n
        const nextBase = scale(toBigInt(gasPrice.fees?.maxBaseFeePerGas) ?? currentBase)
        const nextPriority = scale(toBigInt(gasPrice.fees?.maxPriorityFeePerGas) ?? currentPriority)

        ports.accounts.setPriorityFee(toHex(nextPriority), requestId, true)
        ports.accounts.setBaseFee(toHex(nextBase), requestId, true)
      } else {
        const currentGasPrice = toBigInt(request.data.gasPrice) ?? 0n
        ports.accounts.setGasPrice(toHex(toBigInt(levelValue) ?? scale(currentGasPrice)), requestId, true)
      }

      ports.accounts.current()?.patchRequest<TransactionRequest>(requestId, (updatedRequest) => {
        updatedRequest.feesUpdatedByUser = false
      })
      return true
    },

    adjustTransactionNonce(requestId: string, direction: -1 | 1) {
      if (currentRequest(requestId)?.type !== 'transaction') return false
      ports.accounts.adjustNonce(requestId, direction)
      return true
    },

    resetTransactionNonce(requestId: string) {
      if (currentRequest(requestId)?.type !== 'transaction') return false
      ports.accounts.resetNonce(requestId)
      return true
    },

    async dismissTransactionFeeNotice(requestId: string) {
      if (currentRequest(requestId)?.type !== 'transaction') return false
      await ports.feeNotices.remove(requestId)
      return true
    }
  }
}

export type RequestEditService = ReturnType<typeof createRequestEditService>
