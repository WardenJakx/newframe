import { createRoot } from 'react-dom/client'
import { UIRoot } from '@newframe/ui/root'

import App from '../../app/renderer/tray/App'

import link from '../../platform/ipc/renderer/link'
import { connectRendererState } from '../../platform/state-sync/renderer/connectState'
import { createRendererStateStore } from '../../platform/state-sync/renderer/rendererStore'
import { RendererStateProvider } from '../../platform/state-sync/renderer/useAppSelector'
import type { TrayRendererState } from '../../app/renderer/tray/state'

import '../../../generated/styled-system/styles.css'

document.addEventListener('dragover', (e) => e.preventDefault())
document.addEventListener('drop', (e) => e.preventDefault())

const selectTrayOpen = (state: TrayRendererState) => state.tray.open

function updateTrayVisibility(open: boolean) {
  document.body.classList.toggle('suspend', !open)
}

async function start() {
  const state = createRendererStateStore()
  const disconnectState = await connectRendererState('wallet-ui', state, link)
  const unsubscribe = state.wallet.subscribe((state, previous) => {
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
  updateTrayVisibility(selectTrayOpen(state.wallet.getState()))
  const root = createRoot(document.getElementById('tray') as HTMLElement)
  root.render(
    <UIRoot>
      <RendererStateProvider state={state}>
        <App />
      </RendererStateProvider>
    </UIRoot>
  )
}

void start().catch((error) => console.error('Could not connect tray state', error))
document.addEventListener('mouseout', (e) => {
  if (e.clientX < 0) void link.executeCommand({ type: 'tray.mouseout' })
})
document.addEventListener('contextmenu', (e) => {
  void link.executeCommand({ type: 'renderer.context-menu', x: e.clientX, y: e.clientY })
})
