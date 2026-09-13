import { useShallow } from 'zustand/react/shallow'

import { useWalletSelector } from '../../../../../platform/state-sync/renderer/useAppSelector'
import type { HomeCapability } from '../homeCapability'
import { useHomeUiStore } from '../state/HomeUiProvider'
import { HomeMenuView } from './HomeMenuView'

export function HomeMenu({ capability }: { capability: Pick<HomeCapability, 'quit'> }) {
  const shared = useWalletSelector(
    useShallow((state) => {
      return {
        instanceId: state.instanceId || '',
        tokenCount: Object.values(state.tokens.byId).filter((token) => token.custom).length
      }
    })
  )
  const pushOverlay = useHomeUiStore((state) => state.pushOverlay)
  const closeOverlay = useHomeUiStore((state) => state.closeOverlay)

  return (
    <HomeMenuView
      {...shared}
      onClose={closeOverlay}
      onOpenAbout={() => pushOverlay({ type: 'about' })}
      onOpenDapps={() => pushOverlay({ type: 'dapps' })}
      onOpenSettings={() => pushOverlay({ type: 'settings' })}
      onOpenTokens={() => pushOverlay({ type: 'tokens' })}
      onQuit={() => void capability.quit()}
    />
  )
}
