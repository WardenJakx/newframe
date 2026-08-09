import { beforeEach, describe, expect, it } from 'bun:test'

import { render } from '../../../../test/support/componentSetup'
import { applyStateMessage, beginStateConnection, resetStateMirrorForTests } from '../../state-sync/renderer/rendererStore'
import Badge from './index'
import { STATE_STREAM_SCHEMA_VERSION } from '../../state-sync/contract/protocol'
import { walletState } from '../../state-sync/renderer/fixtures.test-support.ts'

describe('Badge', () => {
  beforeEach(() => {
    resetStateMirrorForTests()
    beginStateConnection('wallet-ui')
    applyStateMessage({
      schemaVersion: STATE_STREAM_SCHEMA_VERSION,
      streamId: 'badge-tests',
      revision: 0,
      state: walletState({})
    })
  })

  it('renders a missing badge without entering a selector update loop', () => {
    render(<Badge />)

    expect(document.querySelector('.badgeWrap')).toBeNull()
  })
})
