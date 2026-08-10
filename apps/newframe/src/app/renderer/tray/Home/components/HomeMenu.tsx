import { useShallow } from 'zustand/react/shallow'

import { useWalletSelector } from '../../../../../platform/state-sync/renderer/useAppSelector'
import { useHomeUiStore } from '../state/HomeUiProvider'
import { HomeMenuView } from './HomeMenuView'
import type { HomeCapability } from '../homeCapability'

export function HomeMenu({ capability }: { capability: Pick<HomeCapability, 'quit'> }) {
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
      onQuit={() => void capability.quit()}
    />
  )
}
