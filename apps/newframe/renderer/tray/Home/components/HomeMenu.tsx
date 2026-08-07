import { useShallow } from 'zustand/react/shallow'

import link from '../../../shared/link'
import { useWalletSelector } from '../../../state/useAppSelector'
import { useHomeUiStore } from '../state/HomeUiProvider'
import { HomeMenuView } from './HomeMenuView'

export function HomeMenu() {
  const shared = useWalletSelector(
    useShallow((state) => {
      return {
        instanceId: state.instanceId || '',
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
      onOpenSettings={() => openOverlay({ type: 'settings' })}
      onOpenTokens={() => openOverlay({ type: 'tokens' })}
      onQuit={() => void link.executeCommand({ type: 'app.quit' })}
    />
  )
}
