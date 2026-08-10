import { beforeEach, describe, expect, it } from 'bun:test'

import { render } from '../../../../test/support/componentSetup'
import { registerTestRuntimeFixture } from '../../../../test/support/rendererClient'
import Badge from './index'
import { STATE_STREAM_SCHEMA_VERSION } from '../../state-sync/contract/protocol'
import { walletState } from '../../state-sync/renderer/fixtures.test-support.ts'
import { createUpdaterCapability } from './updaterCapability'

const fixture = registerTestRuntimeFixture()

describe('Badge', () => {
  beforeEach(() => {
    fixture.state.reset({})
    fixture.state.beginStateConnection('wallet-ui')
    fixture.state.applyStateMessage({
      schemaVersion: STATE_STREAM_SCHEMA_VERSION,
      streamId: 'badge-tests',
      revision: 0,
      state: walletState({})
    })
  })

  it('renders a missing badge without entering a selector update loop', () => {
    render(<Badge capability={createUpdaterCapability(fixture.client)} />)

    expect(document.querySelector('.badgeWrap')).toBeNull()
  })
})
