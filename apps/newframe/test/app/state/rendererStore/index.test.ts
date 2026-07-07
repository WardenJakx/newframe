import {
  applyRestoreActionBatch,
  getRendererStateSnapshot as getStateSnapshot,
  initializeRendererStateStore as initializeStateStore,
  subscribeToRendererState as subscribeState
} from '../../../../app/state/rendererStore'

describe('rendererStore', () => {
  beforeEach(() => {
    initializeStateStore({
      main: {
        accounts: {
          one: { id: 'one', name: 'Account One' }
        }
      },
      selected: {
        current: 'one'
      }
    })
  })

  it('initializes from a full renderer state object', () => {
    expect(getStateSnapshot()).toEqual({
      main: {
        accounts: {
          one: { id: 'one', name: 'Account One' }
        }
      },
      selected: {
        current: 'one'
      }
    })
  })

  it('applies nested path updates immutably', () => {
    const previousState = getStateSnapshot()
    const previousSelected = previousState.selected

    applyRestoreActionBatch([
      {
        updates: [{ path: 'main.accounts.one.name', value: 'Renamed Account' }]
      }
    ])

    const nextState = getStateSnapshot()

    expect(nextState.main.accounts.one.name).toBe('Renamed Account')
    expect(nextState).not.toBe(previousState)
    expect(nextState.main).not.toBe(previousState.main)
    expect(nextState.selected).toBe(previousSelected)
  })

  it('applies full-state replacement updates', () => {
    applyRestoreActionBatch([
      {
        updates: [{ path: '*', value: { selected: { current: 'two' } } }]
      }
    ])

    expect(getStateSnapshot()).toEqual({ selected: { current: 'two' } })
  })

  it('notifies subscribers after updates', () => {
    const listener = jest.fn()
    const unsubscribeRendererState = subscribeState(listener)

    applyRestoreActionBatch([
      {
        updates: [{ path: 'selected.current', value: 'two' }]
      }
    ])

    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribeRendererState()
    applyRestoreActionBatch([
      {
        updates: [{ path: 'selected.current', value: 'three' }]
      }
    ])

    expect(listener).toHaveBeenCalledTimes(1)
  })
})
