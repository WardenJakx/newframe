import { describe, expect, it } from 'bun:test'

import { createHomeUiStore } from './homeUiStore'

describe('homeUiStore', () => {
  it('coordinates sections, networks, and mutually exclusive overlays', () => {
    const store = createHomeUiStore()

    store.getState().setSection('orders')
    store.getState().setSelectedChainId(10)
    store.getState().openOverlay({ type: 'settings' })

    expect(store.getState()).toMatchObject({
      section: 'orders',
      selectedChainId: 10,
      overlay: { type: 'settings' }
    })

    store.getState().openOverlay({ type: 'receive', accountId: 'account-1' })
    expect(store.getState().overlay).toEqual({ type: 'receive', accountId: 'account-1' })

    store.getState().closeOverlay()
    expect(store.getState().overlay).toEqual({ type: 'none' })
  })
})
