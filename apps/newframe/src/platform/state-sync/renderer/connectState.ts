import { createStore, type StoreApi } from 'zustand/vanilla'

import type { RendererState, StateConnectionResult, StateMessage } from '../contract/protocol'

export interface RendererStateConnectionClient {
  connectState(handler: (message: StateMessage) => void): Promise<StateConnectionResult>
  disconnectState(): Promise<StateConnectionResult>
}

// Main validates every message against this window's projection schema before
// sending, so TState is asserted here instead of being parsed a second time.
export async function connectRendererState<TState extends RendererState>(
  client: RendererStateConnectionClient
) {
  let store: StoreApi<TState> | undefined
  let resolveStore!: (store: StoreApi<TState>) => void
  const initialStore = new Promise<StoreApi<TState>>((resolve) => {
    resolveStore = resolve
  })

  const result = await client.connectState((message) => {
    if ('changes' in message) {
      store?.setState(message.changes as Partial<TState>)
    } else if (store) {
      store.setState(message.state as TState, true)
    } else {
      const state = message.state as TState
      store = createStore<TState>()(() => state)
      resolveStore(store)
    }
  })
  if (!result.ok) {
    throw new Error(`State connection failed: ${result.error}`)
  }

  return { state: await initialStore, disconnect: () => client.disconnectState() }
}
