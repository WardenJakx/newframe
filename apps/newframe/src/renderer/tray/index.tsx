import { UIRoot } from '@newframe/ui/root'
import { createRoot } from 'react-dom/client'

import App from '../../app/renderer/tray/App.tsx'
import link from '../../platform/ipc/renderer/link.ts'
import type { MainTrayProjection } from '../../platform/state-sync/contract/projections.ts'
import { connectTrayState } from '../../platform/state-sync/renderer/connectState.ts'
import { TrayStateProvider } from '../../platform/state-sync/renderer/useAppSelector.tsx'

import '../../../generated/styled-system/styles.css'

document.addEventListener('dragover', (e) => e.preventDefault())
document.addEventListener('drop', (e) => e.preventDefault())

const selectTrayOpen = (state: MainTrayProjection) => state.tray.open

function updateTrayVisibility(open: boolean) {
  document.body.classList.toggle('suspend', !open)
}

async function start() {
  const { state, disconnect } = await connectTrayState<MainTrayProjection>(link)
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
      <TrayStateProvider state={stores}>
        <App />
      </TrayStateProvider>
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
  void link.executeCommand({ type: 'tray.context-menu', x: e.clientX, y: e.clientY })
})
