import mapCaipRequest from './methods/caipRequest.js'
import mapWalletRequest from './methods/walletRequest.js'

export function mapRequest(requestPayload: RPCRequestPayload): RPCRequestPayload {
  if (requestPayload.method === 'caip_request') {
    return mapCaipRequest(requestPayload)
  }

  if (requestPayload.method === 'wallet_request') {
    return mapWalletRequest(requestPayload)
  }

  return requestPayload
}
