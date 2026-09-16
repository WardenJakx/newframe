import type { OperationService } from '../../../../platform/operations/service.js'
import AirGapSigner from '../../../../platform/signing/signers/airgap/AirGapSigner.js'
import {
  AirGapUrAssembler,
  airGapId,
  decodePublicAccount
} from '../../../../platform/signing/signers/airgap/protocol.js'
import type canonicalStore from '../../../../platform/state-store/index.js'
import type { AccountsRuntime } from '../runtime.js'
import { createAirGapService } from './service.js'

export function createProductionAirGapService(
  store: typeof canonicalStore,
  signers: AccountsRuntime['signers'],
  operations: OperationService
) {
  const getSigner = (id: string) => {
    const signer = signers.get(id)
    return signer instanceof AirGapSigner ? signer : undefined
  }
  return createAirGapService({
    operations,
    createPairScanner() {
      const decoder = new AirGapUrAssembler('crypto-hdkey')
      return {
        receive(frame) {
          const cbor = decoder.receive(frame)
          if (!cbor) {
            return
          }
          try {
            return decodePublicAccount(cbor)
          } finally {
            decoder.reset()
          }
        }
      }
    },
    addPublicAccount(account) {
      const id = airGapId(account)
      store.getState().addAirGap(id, account)
      return id
    },
    getRequest: (reference, owner) => getSigner(reference.signerId)?.getRequest(reference, owner),
    scan: async (reference, owner, frame) =>
      getSigner(reference.signerId)?.scan(reference, owner, frame) ?? false,
    cancel: (reference, owner) => getSigner(reference.signerId)?.cancelRequest(reference, owner) ?? false
  })
}
