import React from 'react'

import { render } from '../../../componentSetup'
import {
  applyStateMessage,
  beginStateConnection,
  resetStateMirrorForTests
} from '../../../../app/state/rendererStore'
import Badge from '../../../../app/tray/Badge'
import { STATE_STREAM_SCHEMA_VERSION } from '../../../../resources/state/protocol'
import { walletState } from '../../state/fixtures'

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
