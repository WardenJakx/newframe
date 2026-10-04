import { UIRoot } from '@newframe/ui/root'
import { createRoot } from 'react-dom/client'

import link from '../shared/host/link.ts'
import { connectRendererState } from '../shared/projection/connectState.ts'
import type { TrayRendererState } from '../shared/projection/state.ts'
import { RendererStateProvider } from '../shared/projection/useAppSelector.tsx'
import App from './App.tsx'

import '../../../generated/styled-system/styles.css'

document.addEventListener('dragover', (e) => e.preventDefault())
document.addEventListener('drop', (e) => e.preventDefault())

const selectTrayOpen = (state: TrayRendererState) => state.tray.open

function updateTrayVisibility(open: boolean) {
  document.body.classList.toggle('suspend', !open)
}

async function start() {
  const { state, disconnect } = await connectRendererState<TrayRendererState>(link)
  const stores = { wallet: state }
  const unsubscribe = state.subscribe((state, previous) => {
    const open = selectTrayOpen(state)
    if (open !== selectTrayOpen(previous)) {
      updateTrayVisibility(open)
    }
  })

  window.addEventListener(
    'beforeunload',
    () => {
      unsubscribe()
      void disconnect()
    },
    { once: true }
  )

  document.body.classList.add('dark')
  updateTrayVisibility(selectTrayOpen(state.getState()))
  const root = createRoot(document.getElementById('tray') as HTMLElement)
  root.render(
    <UIRoot>
      <RendererStateProvider state={stores}>
        <App />
      </RendererStateProvider>
    </UIRoot>
  )
}

void start().catch((error: unknown) => console.error('Could not connect tray state', error))
document.addEventListener('mouseout', (e) => {
  if (e.clientX < 0) {
    void link.executeCommand({ type: 'tray.mouseout' })
  }
})
document.addEventListener('contextmenu', (e) => {
  void link.executeCommand({ type: 'renderer.context-menu', x: e.clientX, y: e.clientY })
})
