import type { NewframeHost } from '../../platform/ipc/contract/ipc.ts'
import type { ClipboardCapability, TokenImageCapability } from './capabilities.ts'

export function createTrayUtilityCapabilities(
  host: Pick<NewframeHost, 'executeCommand'>
): ClipboardCapability & TokenImageCapability {
  return {
    writeText: (text) => host.executeCommand({ type: 'clipboard.write', text }),
    hydrateTokenImage: (tokenId) => host.executeCommand({ type: 'token.image-hydrate', tokenId })
  }
}
