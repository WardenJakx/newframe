import React from 'react'
import { useShallow } from 'zustand/react/shallow'

import { act, render, screen } from '../../../componentSetup'
import {
  applyStateMessage,
  beginStateConnection,
  resetStateMirrorForTests
} from '../../../../app/state/rendererStore'
import { useWalletSelector } from '../../../../app/state/useAppSelector'
import type { WalletRendererState } from '../../../../resources/state/projections'
import {
  STATE_STREAM_SCHEMA_VERSION,
  type StateSnapshot,
  type StateUpdateBatch
} from '../../../../resources/state/protocol'
import { walletChanges, walletState } from '../fixtures'

const snapshot = (state: Partial<WalletRendererState>): StateSnapshot<WalletRendererState> => ({
  schemaVersion: STATE_STREAM_SCHEMA_VERSION,
  streamId: 'selector-tests',
  revision: 0,
  state: walletState(state)
})

const update = (
  changes: Partial<WalletRendererState>,
  baseRevision = 0
): StateUpdateBatch<WalletRendererState> => ({
  schemaVersion: STATE_STREAM_SCHEMA_VERSION,
  streamId: 'selector-tests',
  baseRevision,
  revision: baseRevision + 1,
  changes: walletChanges(changes)
})

describe('useWalletSelector', () => {
  beforeEach(() => {
    resetStateMirrorForTests()
    beginStateConnection('wallet-ui')
    applyStateMessage(snapshot({ currentAccount: 'one' }))
  })

  it('reads selected values from the renderer state mirror', () => {
    function SelectedAccount() {
      const current = useWalletSelector((state) => state.currentAccount)
      return <div>{current}</div>
    }

    render(<SelectedAccount />)
    expect(screen.getByText('one')).toBeTruthy()
  })

  it('updates when mirrored state changes', () => {
    function CurrentAccount() {
      const current = useWalletSelector((state) => state.currentAccount)
      return <div>{current}</div>
    }

    render(<CurrentAccount />)
    act(() => {
      applyStateMessage(update({ currentAccount: 'two' }))
    })

    expect(screen.getByText('two')).toBeTruthy()
  })

  it('uses Zustand useShallow for stable composite selections', () => {
    const selections: Array<{ currentAccount: string }> = []

    function StableSelection() {
      const selection = useWalletSelector(useShallow((state) => ({ currentAccount: state.currentAccount })))
      selections.push(selection)
      return <div>{selection.currentAccount}</div>
    }

    render(<StableSelection />)
    const firstSelection = selections[0]

    act(() => {
      applyStateMessage(update({ rates: { token: { usd: { price: 1, change24hr: 0 } } } }))
    })
    expect(selections).toHaveLength(1)

    act(() => {
      applyStateMessage(update({ currentAccount: 'three' }, 1))
    })

    expect(selections).toHaveLength(2)
    expect(selections[0]).toBe(firstSelection)
    expect(selections[1]).not.toBe(firstSelection)
    expect(screen.getByText('three')).toBeTruthy()
  })
})
