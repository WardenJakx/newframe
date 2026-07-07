import React from 'react'

import { act, render, screen } from '../../../componentSetup'
import {
  applyRestoreActionBatch,
  initializeRendererStateStore as initializeStateStore
} from '../../../../app/state/rendererStore'
import { shallowEqual, useAppSelector } from '../../../../app/state/useAppSelector'

describe('useAppSelector', () => {
  beforeEach(() => {
    initializeStateStore({
      counter: 1,
      selected: {
        current: 'one'
      }
    })
  })

  it('reads selected values from the renderer state mirror', () => {
    function SelectedAccount() {
      const current = useAppSelector((state) => state.selected.current)

      return <div>{current}</div>
    }

    render(<SelectedAccount />)

    expect(screen.getByText('one')).toBeTruthy()
  })

  it('updates when mirrored state changes', () => {
    function Counter() {
      const counter = useAppSelector((state) => state.counter)

      return <div>{counter}</div>
    }

    render(<Counter />)

    act(() => {
      applyRestoreActionBatch([{ updates: [{ path: 'counter', value: 2 }] }])
    })

    expect(screen.getByText('2')).toBeTruthy()
  })

  it('respects equality for stable selected snapshots', () => {
    const selections: Array<{ counter: number }> = []

    function StableSelection() {
      const selection = useAppSelector((state) => ({ counter: state.counter }), shallowEqual)
      selections.push(selection)

      return <div>{selection.counter}</div>
    }

    render(<StableSelection />)
    const firstSelection = selections[0]

    act(() => {
      applyRestoreActionBatch([{ updates: [{ path: 'selected.current', value: 'two' }] }])
    })

    expect(selections).toHaveLength(1)

    act(() => {
      applyRestoreActionBatch([{ updates: [{ path: 'counter', value: 3 }] }])
    })

    expect(selections).toHaveLength(2)
    expect(selections[0]).toBe(firstSelection)
    expect(selections[1]).not.toBe(firstSelection)
    expect(screen.getByText('3')).toBeTruthy()
  })
})
