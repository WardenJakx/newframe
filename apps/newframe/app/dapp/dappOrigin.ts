import { v5 as uuidv5 } from 'uuid'

export const internalDappOriginName = 'newframe-internal'
export const internalDappOriginId = uuidv5(internalDappOriginName, uuidv5.DNS)

export function buildInternalDappOrigin(chainId: number) {
  return {
    name: internalDappOriginName,
    chain: { id: chainId, type: 'ethereum' as const }
  }
}
