import { beforeEach, describe, expect, it } from 'bun:test'

import { render } from '../../../../test/support/componentSetup.tsx'
import { registerTestRuntimeFixture } from '../../../../test/support/trayClient.ts'
import { walletState } from '../../state-sync/renderer/fixtures.test-support.ts'
import Badge from './index.tsx'
import { createUpdaterCapability } from './updaterCapability.ts'

const fixture = registerTestRuntimeFixture()

describe('Badge', () => {
  beforeEach(() => {
    fixture.state.reset(walletState({}))
  })

  it('renders a missing badge without entering a selector update loop', () => {
    render(<Badge capability={createUpdaterCapability(fixture.client)} />)

    expect(document.querySelector('.badgeWrap')).toBeNull()
  })
})
