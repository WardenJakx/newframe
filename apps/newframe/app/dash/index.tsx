import { createRoot } from 'react-dom/client'
import Restore from 'react-restore'

import App from './App'

import link from '../../resources/link'
import appStore from '../store'

document.addEventListener('dragover', (e) => e.preventDefault())
document.addEventListener('drop', (e) => e.preventDefault())

function AppComponent() {
  return <App />
}

link.rpc('getState', (err: any, state: any) => {
  if (err) return console.error('Could not get initial state from main')
  const store = (appStore as any)(state)
  ;(window as any).store = store
  document.body.classList.add('dark')
  const root = createRoot(document.getElementById('dash') as HTMLElement)
  const Dash = Restore.connect(AppComponent, store)
  root.render(<Dash />)
})

document.addEventListener('contextmenu', (e) => link.send('*:contextmenu', e.clientX, e.clientY))

// document.addEventListener('mouseout', e => { if (e.clientX < 0) link.send('tray:mouseout') })
// document.addEventListener('contextmenu', e => link.send('tray:contextmenu', e.clientX, e.clientY))
