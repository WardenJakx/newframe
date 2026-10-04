import { UIRoot } from '@newframe/ui/root'
import { createRoot } from 'react-dom/client'

import App from '../../app/renderer/sidetray/App.tsx'

import '../../../generated/styled-system/styles.css'

import { createSendCapability } from '../../features/transactions/send/renderer/sendService.ts'
import { createTradeCapability } from '../../features/transactions/trade/renderer/tradeService.ts'
import link from '../../platform/ipc/renderer/link.ts'
import type { SideTrayRendererState } from '../../platform/state-sync/contract/projections.ts'
import { connectRendererState } from '../../platform/state-sync/renderer/connectState.ts'
import { RendererStateProvider } from '../../platform/state-sync/renderer/useAppSelector.tsx'

document.addEventListener('dragover', (e) => e.preventDefault())
document.addEventListener('drop', (e) => e.preventDefault())

async function start() {
  const { state, disconnect } = await connectRendererState<SideTrayRendererState>(link)
  const stores = { sideTray: state }
  const send = createSendCapability(link)
  const trade = createTradeCapability(link)
  window.addEventListener('beforeunload', () => void disconnect(), { once: true })
  const root = createRoot(document.getElementById('sidetray') as HTMLElement)
  root.render(
    <UIRoot>
      <RendererStateProvider state={stores}>
        <App send={send} trade={trade} />
      </RendererStateProvider>
    </UIRoot>
  )
}

void start().catch((error: unknown) => console.error('Could not connect side tray state', error))

document.addEventListener('contextmenu', (event) => {
  void link.executeCommand({
    type: 'renderer.context-menu',
    x: event.clientX,
    y: event.clientY
  })
})
