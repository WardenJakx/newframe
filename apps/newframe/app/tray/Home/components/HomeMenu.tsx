import { useShallow } from 'zustand/react/shallow'

import link from '../../../../resources/link'
import { useWalletSelector } from '../../../state/useAppSelector'
import { useHomeUiStore } from '../state/HomeUiProvider'
import { HomeMenuView } from './HomeMenuView'

export function HomeMenu() {
  const shared = useWalletSelector(
    useShallow((state) => {
      const account = state.accounts?.[state.currentAccount]
      const requests = account?.requests || {}
      return {
        instanceId: state.instanceId || '',
        requestCount: Object.keys(requests).filter((id) => requests[id].mode === 'normal').length,
        tokenCount: Object.values(state.tokens.byId).filter((token) => token.custom).length
      }
    })
  )
  const openOverlay = useHomeUiStore((state) => state.openOverlay)
  const closeOverlay = useHomeUiStore((state) => state.closeOverlay)

  return (
    <HomeMenuView
      {...shared}
      onClose={closeOverlay}
      onOpenAbout={() => openOverlay({ type: 'about' })}
      onOpenDapps={() => openOverlay({ type: 'dapps' })}
      onOpenRequests={() => openOverlay({ type: 'requests' })}
      onOpenSettings={() => openOverlay({ type: 'settings' })}
      onOpenTokens={() => openOverlay({ type: 'tokens' })}
      onQuit={() => void link.executeCommand({ type: 'app.quit' })}
    />
  )
}
