import { decodeMessage, encodePersonalSignMessage } from '../../connections/main/provider/helpers.js'
import type { AccountRequest } from '../contract/requests.js'
import { inspectSiweMessage } from '../domain/siwe.js'

/** Validate the original personal_sign bytes against main-owned transport authority. */
export function siweSigningBlock(
  request: AccountRequest,
  options: { signingAddress?: string; isContractAccount?: boolean; chainId?: number } = {}
): string | undefined {
  if (request.type !== 'sign') {
    return
  }
  const rawMessage: unknown = Array.isArray(request.payload.params) ? request.payload.params[1] : undefined
  if (typeof rawMessage !== 'string') {
    return
  }
  const principal = request.authorization?.principal
  const inspection = inspectSiweMessage(
    decodeMessage(encodePersonalSignMessage(rawMessage)),
    principal?.kind === 'rpc' ? principal.websiteOrigin : undefined,
    {
      signingAddress: options.signingAddress ?? request.account,
      isContractAccount: options.isContractAccount
    }
  )
  if (inspection.kind !== 'siwe') {
    return
  }
  if (inspection.blockedReason) {
    return inspection.blockedReason
  }
  if (
    options.chainId !== undefined &&
    (!Number.isSafeInteger(inspection.parsed.chainId) ||
      inspection.parsed.chainId <= 0 ||
      inspection.parsed.chainId !== options.chainId)
  ) {
    return 'The sign-in chain does not match this Safe deployment. Signing is blocked.'
  }
}
