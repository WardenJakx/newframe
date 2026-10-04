import { beforeEach, describe, expect, it } from 'bun:test'

import { useShallow } from 'zustand/react/shallow'

import { act, render, screen } from '../../../../test/support/componentSetup.tsx'
import { registerTestRuntimeFixture } from '../../../../test/support/trayClient.ts'
import { walletState } from './fixtures.test-support.ts'
import { useWalletSelector } from './useAppSelector.tsx'

const fixture = registerTestRuntimeFixture()

describe('useWalletSelector', () => {
  beforeEach(() => {
    fixture.state.reset(walletState({ currentAccount: 'one' }))
  })

  it('reads selected values from the tray state mirror', () => {
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
      fixture.state.wallet.setState({ currentAccount: 'two' })
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
      fixture.state.wallet.setState({
        assetRates: { token: { usdRate: 1, source: 'zerion', observedAt: 1 } }
      })
    })
    expect(selections).toHaveLength(1)

    act(() => {
      fixture.state.wallet.setState({ currentAccount: 'three' })
    })

    expect(selections).toHaveLength(2)
    expect(selections[0]).toBe(firstSelection)
    expect(selections[1]).not.toBe(firstSelection)
    expect(screen.getByText('three')).toBeTruthy()
  })
})
