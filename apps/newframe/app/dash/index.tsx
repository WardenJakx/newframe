import { createRoot } from 'react-dom/client'

import App from './App'

import link from '../../resources/link'
import { connectRendererState } from '../state/connectState'

document.addEventListener('dragover', (e) => e.preventDefault())
document.addEventListener('drop', (e) => e.preventDefault())

function AppComponent() {
  return <App />
}

async function start() {
  const disconnect = await connectRendererState('wallet-ui')
  window.addEventListener('beforeunload', () => void disconnect(), { once: true })
  document.body.classList.add('dark')
  const root = createRoot(document.getElementById('dash') as HTMLElement)
  root.render(<AppComponent />)
}

void start().catch((error) => console.error('Could not connect dash state', error))

document.addEventListener('contextmenu', (e) => {
  void link.executeCommand({ type: 'dash.context-menu', x: e.clientX, y: e.clientY })
})
