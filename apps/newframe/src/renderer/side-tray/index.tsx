import { UIRoot } from '@newframe/ui/root'
import { createRoot } from 'react-dom/client'

import App from '../../app/renderer/side-tray/App.tsx'

import '../../../generated/styled-system/styles.css'

import { createSendCapability } from '../../features/transactions/send/renderer/sendService.ts'
import { createTradeCapability } from '../../features/transactions/trade/renderer/tradeService.ts'
import link from '../../platform/ipc/renderer/link.ts'
import type { SideTrayProjection } from '../../platform/state-sync/contract/projections.ts'
import { connectTrayState } from '../../platform/state-sync/renderer/connectState.ts'
import { TrayStateProvider } from '../../platform/state-sync/renderer/useAppSelector.tsx'

document.addEventListener('dragover', (e) => e.preventDefault())
document.addEventListener('drop', (e) => e.preventDefault())

async function start() {
  const { state, disconnect } = await connectTrayState<SideTrayProjection>(link)
  const stores = { sideTray: state }
  const send = createSendCapability(link)
  const trade = createTradeCapability(link)
  window.addEventListener('beforeunload', () => void disconnect(), { once: true })
  const root = createRoot(document.getElementById('side-tray') as HTMLElement)
  root.render(
    <UIRoot>
      <TrayStateProvider state={stores}>
        <App send={send} trade={trade} />
      </TrayStateProvider>
    </UIRoot>
  )
}

void start().catch((error: unknown) => console.error('Could not connect side tray state', error))

document.addEventListener('contextmenu', (event) => {
  void link.executeCommand({
    type: 'tray.context-menu',
    x: event.clientX,
    y: event.clientY
  })
})
