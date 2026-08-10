import { beforeEach, describe, expect, it } from 'bun:test'

import { render, screen, waitFor } from '../../../../../../test/support/componentSetup'
import { registerTestRuntimeFixture } from '../../../../../../test/support/rendererClient'
import { walletState } from '../../../../../platform/state-sync/renderer/fixtures.test-support.ts'
import { HomeUiProvider, useHomeUiStore } from '../state/HomeUiProvider'
import { useHomeCommand } from './useHomeCommand'
import { createHomeCapability } from '../homeCapability'

const fixture = registerTestRuntimeFixture()
const capability = createHomeCapability({
  executeCommand: (command) => fixture.client.executeCommand(command)
})

function CommandObserver() {
  useHomeCommand(capability)
  const overlay = useHomeUiStore((state) => state.overlay)
  return <output>{JSON.stringify(overlay)}</output>
}

describe('useHomeCommand', () => {
  beforeEach(() => {
    fixture.state.reset({})
  })

  it('opens an add-chain review from an explicit request identifier', async () => {
    fixture.state.reset(
      walletState({
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
    )

    render(
      <HomeUiProvider>
        <CommandObserver />
      </HomeUiProvider>
    )

    await waitFor(() => {
      expect(screen.getByText(/"requestId":"request-1"/)).toBeTruthy()
    })
    expect(screen.getByText(/"chain":\{"id":10/)).toBeTruthy()
    expect(fixture.client.executeCommand).toHaveBeenCalledWith({
      type: 'home.command-consume',
      commandId: 7
    })
  })
})
