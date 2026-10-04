import { expect, it } from 'bun:test'

import { createRendererClient as createTypedClient } from '../../../../test/support/rendererClient.ts'
import { createNetworksCapability } from './networksCapability.ts'

it('maps network removal to the command catalog', async () => {
  const host = createTypedClient()
  const capability = createNetworksCapability(host)

  await capability.remove({ chainId: 31337 })

  expect(host.executeCommand).toHaveBeenCalledWith({ type: 'network.remove', chainId: 31337 })
})
