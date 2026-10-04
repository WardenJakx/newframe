import type { RPCRequestPayload } from '@newframe/schema/rpc'

import mapCaipRequest from './methods/caipRequest.ts'
import mapWalletRequest from './methods/walletRequest.ts'

export function mapRequest(requestPayload: RPCRequestPayload): RPCRequestPayload {
  if (requestPayload.method === 'caip_request') {
    return mapCaipRequest(requestPayload)
  }

  if (requestPayload.method === 'wallet_request') {
    return mapWalletRequest(requestPayload)
  }

  return requestPayload
}
