import { UIRoot } from '@newframe/ui/root'
import { createRoot } from 'react-dom/client'

import { Settings } from './Settings'
import { getMetaMaskSetting, isSupportedTab } from './tabSettings'
import '../styled-system/styles.css'

document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  const mmAppear = isSupportedTab(tab) && tab?.id !== undefined ? await getMetaMaskSetting(tab.id) : false
  const root = document.getElementById('root')
  if (!root) throw new Error('Settings root not found')

  createRoot(root).render(
    <UIRoot>
      <Settings tab={tab} mmAppear={mmAppear} />
    </UIRoot>
  )
})
