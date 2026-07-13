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
  if (err) return console.error('Could not get initial state from main.')
  const store = appStore(state)
  link.send('tray:ready') // turn on api

  document.body.classList.add('dark')
  store.observer(() => {
    if (store('tray.open')) {
      document.body.classList.remove('suspend')
    } else {
      document.body.classList.add('suspend')
    }
  })
  const root = createRoot(document.getElementById('tray') as HTMLElement)
  const Tray = Restore.connect(AppComponent, store)
  root.render(<Tray />)
})
// document.addEventListener('mouseover', e => link.send('tray:focus'))
document.addEventListener('mouseout', (e) => {
  if (e.clientX < 0) link.send('tray:mouseout')
})
document.addEventListener('contextmenu', (e) => link.send('*:contextmenu', e.clientX, e.clientY))
