import type { RequestTokenApprovalUpdateCommand } from '../../../../app/contracts/operations.js'
import type { Accounts } from '../../../accounts/main/index.js'
import type { AccountRequest, PermitSignatureRequest, TransactionRequest } from '../../contract/requests.js'

export interface RequestEditServicePorts {
  accounts: Pick<Accounts, 'current' | 'updateRequest'>
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
    }
  }
}

export type RequestEditService = ReturnType<typeof createRequestEditService>
