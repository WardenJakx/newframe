import { createRoot } from 'react-dom/client'

import App from './App'

import link from '../../resources/link'
import { connectRendererState } from '../state/connectState'
import { walletRendererStateStoreReadApi } from '../state/rendererStore'
import type { TrayRendererState } from './state'

document.addEventListener('dragover', (e) => e.preventDefault())
document.addEventListener('drop', (e) => e.preventDefault())

const selectTrayOpen = (state: TrayRendererState) => state.tray.open

function updateTrayVisibility(open: boolean) {
  document.body.classList.toggle('suspend', !open)
}

async function start() {
  const disconnectState = await connectRendererState('wallet-ui')
  const unsubscribe = walletRendererStateStoreReadApi.subscribe((state, previous) => {
    const open = selectTrayOpen(state)
    if (open !== selectTrayOpen(previous)) updateTrayVisibility(open)
  })

  window.addEventListener(
    'beforeunload',
    () => {
      unsubscribe()
      void disconnectState()
    },
    { once: true }
  )

  document.body.classList.add('dark')
  updateTrayVisibility(selectTrayOpen(walletRendererStateStoreReadApi.getState()))
  const root = createRoot(document.getElementById('tray') as HTMLElement)
  root.render(<App />)
}

void start().catch((error) => console.error('Could not connect tray state', error))
document.addEventListener('mouseout', (e) => {
  if (e.clientX < 0) void link.executeCommand({ type: 'tray.mouseout' })
})
document.addEventListener('contextmenu', (e) => {
  void link.executeCommand({ type: 'tray.context-menu', x: e.clientX, y: e.clientY })
})
