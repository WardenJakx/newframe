import { beforeEach, describe, expect, it } from 'bun:test'

import { render, screen, waitFor } from '../../../../test/support/componentSetup'
import { createHostFixture } from '../../../../test/support/rendererClient'
import { STATE_STREAM_SCHEMA_VERSION } from '../../../../contracts/state/protocol'
import { walletState } from '../../../state/fixtures.test-support'
import {
  applyStateMessage,
  beginStateConnection,
  resetStateMirrorForTests
} from '../../../state/rendererStore'
import { HomeUiProvider, useHomeUiStore } from '../state/HomeUiProvider'
import { useHomeCommand } from './useHomeCommand'

const linkMock = createHostFixture()

function CommandObserver() {
  useHomeCommand()
  const overlay = useHomeUiStore((state) => state.overlay)
  return <output>{JSON.stringify(overlay)}</output>
}

describe('useHomeCommand', () => {
  beforeEach(() => {
    resetStateMirrorForTests()
    beginStateConnection('wallet-ui')
  })

  it('opens an add-chain review from an explicit request identifier', async () => {
    applyStateMessage({
      schemaVersion: STATE_STREAM_SCHEMA_VERSION,
      streamId: 'home-command-test',
      revision: 0,
      state: walletState({
        tray: {
          open: true,
          initial: false,
          homeCommand: {
            id: 7,
            view: 'addChain',
            data: {
              chain: {
                id: 10,
                name: 'Optimism',
                symbol: 'ETH',
                primaryRpc: 'https://rpc.example'
              },
              requestId: 'request-1'
            }
          }
        }
      })
    })

    render(
      <HomeUiProvider>
        <CommandObserver />
      </HomeUiProvider>
    )

    await waitFor(() => {
      expect(screen.getByText(/"requestId":"request-1"/)).toBeTruthy()
    })
    expect(screen.getByText(/"chain":\{"id":10/)).toBeTruthy()
    expect(linkMock.executeCommand).toHaveBeenCalledWith({
      type: 'home.command-consume',
      commandId: 7
    })
  })
})
