import { expect, it } from 'bun:test'

import { createRendererClient as createTypedClient } from '../../../../../test/support/rendererClient'
import { NATIVE_CURRENCY } from '../../../tokens/domain/constants'
import { createSendCapability } from './sendService'

it('maps semantic send actions to their exact catalog payloads', async () => {
  const host = createTypedClient()
  const send = createSendCapability(host)

  await send.submit({
    operationId: 'operation-1',
    asset: { address: NATIVE_CURRENCY, chainId: 1 },
    amount: '1000000000000000000',
    recipient: 'example.eth'
  })
  await send.close()
  await send.writeText('copy me')
  await send.hydrateTokenImage('1:0x1111111111111111111111111111111111111111')

  expect(host.executeCommand.mock.calls.map(([command]) => command)).toEqual([
    {
      type: 'send.submit',
      operationId: 'operation-1',
      asset: { address: NATIVE_CURRENCY, chainId: 1 },
      amount: '1000000000000000000',
      recipient: 'example.eth'
    },
    { type: 'sidetray.close' },
    { type: 'clipboard.write', text: 'copy me' },
    { type: 'token.image-hydrate', tokenId: '1:0x1111111111111111111111111111111111111111' }
  ])
})
