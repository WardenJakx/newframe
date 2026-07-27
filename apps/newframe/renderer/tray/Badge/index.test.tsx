import { beforeEach, describe, expect, it } from 'bun:test'

import { render } from '../../../test/support/componentSetup'
import { applyStateMessage, beginStateConnection, resetStateMirrorForTests } from '../../state/rendererStore'
import Badge from './index'
import { STATE_STREAM_SCHEMA_VERSION } from '../../../contracts/state/protocol'
import { walletState } from '../../state/fixtures.test-support'

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
