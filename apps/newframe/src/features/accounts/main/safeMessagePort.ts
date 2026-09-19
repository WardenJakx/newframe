import type { SigningUiContext } from '../../../platform/signing/signers/Signer/index.js'
import type { SignatureRequest } from '../../requests/contract/requests.js'
import type { SafeMessageApprovalResult } from './safeMessage.js'

export interface SafeMessageApprovalPort {
  approve(
    request: SignatureRequest,
    ownerId: string,
    context: SigningUiContext
  ): Promise<SafeMessageApprovalResult>
}

export function createDeferredSafeMessageApprovalPort() {
  let target: SafeMessageApprovalPort | undefined
  const port: SafeMessageApprovalPort = {
    approve: (request, ownerId, context) => {
      if (!target) {
        return Promise.reject(new Error('Safe message signing capability is not connected'))
      }
      return target.approve(request, ownerId, context)
    }
  }
  return {
    port,
    connect(next: SafeMessageApprovalPort) {
      const previous = target
      target = next
      let connected = true
      return () => {
        if (!connected) {
          return
        }
        connected = false
        if (target === next) {
          target = previous
        }
      }
    }
  }
}
