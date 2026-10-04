import { expect, it } from 'bun:test'

import { createRendererClient as createTypedClient } from '../../../../test/support/rendererClient.ts'
import { createChainsCapability } from './chainsCapability.ts'

it('maps chain removal to the command catalog', async () => {
  const host = createTypedClient()
  const capability = createChainsCapability(host)

  await capability.remove({ chainId: 31337 })

  expect(host.executeCommand).toHaveBeenCalledWith({ type: 'chain.remove', chainId: 31337 })
})
