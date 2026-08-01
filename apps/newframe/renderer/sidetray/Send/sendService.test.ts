import { expect, it } from 'bun:test'

import { createHostFixture } from '../../../test/support/rendererClient'
import { closeSend } from './sendService'

const link = createHostFixture()

it('closes only its own side tray', () => {
  closeSend()
  expect(link.executeCommand).toHaveBeenCalledWith({ type: 'sidetray.close' })
})
