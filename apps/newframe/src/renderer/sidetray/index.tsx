import { createRoot } from 'react-dom/client'
import { UIRoot } from '@newframe/ui/root'

import App from '../../app/renderer/sidetray/App'

import '../../../generated/styled-system/styles.css'

import link from '../../platform/ipc/renderer/link'
import { connectRendererState } from '../../platform/state-sync/renderer/connectState'
import { createRendererStateStore } from '../../platform/state-sync/renderer/rendererStore'
import { RendererStateProvider } from '../../platform/state-sync/renderer/useAppSelector'
import { createSendCapability } from '../../features/transactions/send/renderer/sendService'
import { createTradeCapability } from '../../features/transactions/trade/renderer/tradeService'

document.addEventListener('dragover', (e) => e.preventDefault())
document.addEventListener('drop', (e) => e.preventDefault())

async function start() {
  const state = createRendererStateStore()
  const disconnect = await connectRendererState('sidetray', state, link)
  const send = createSendCapability(link)
  const trade = createTradeCapability(link)
  window.addEventListener('beforeunload', () => void disconnect(), { once: true })
  const root = createRoot(document.getElementById('sidetray') as HTMLElement)
  root.render(
    <UIRoot>
      <RendererStateProvider state={state}>
        <App send={send} trade={trade} />
      </RendererStateProvider>
    </UIRoot>
  )
}

void start().catch((error) => console.error('Could not connect side tray state', error))

document.addEventListener('contextmenu', (event) => {
  void link.executeCommand({
    type: 'renderer.context-menu',
    x: event.clientX,
    y: event.clientY
  })
})
