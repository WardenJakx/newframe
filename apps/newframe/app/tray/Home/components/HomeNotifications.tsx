import { useShallow } from 'zustand/react/shallow'

import link from '../../../../resources/link'
import { useWalletSelector } from '../../../state/useAppSelector'
import StatusNotifications from '../StatusNotifications'
import { useHomeUiStore } from '../state/HomeUiProvider'
import { ChainIcon } from './ChainIcon'

const EMPTY_RECORD: Record<string, any> = {}

export function HomeNotifications() {
  const shared = useWalletSelector(
    useShallow((state) => ({
      currentAccount: state.currentAccount || '',
      networks: state.networks?.ethereum || EMPTY_RECORD,
      networksMeta: state.networksMeta?.ethereum || EMPTY_RECORD,
      notifications: state.view?.notifications || EMPTY_RECORD
    }))
  )
  const setSection = useHomeUiStore((state) => state.setSection)
  const openOverlay = useHomeUiStore((state) => state.openOverlay)

  return (
    <StatusNotifications
      notifications={shared.notifications}
      onDismiss={(id) =>
        void link.executeCommand({ type: 'notification.update', notificationId: id, action: 'dismiss' })
      }
      onExpire={(id) =>
        void link.executeCommand({ type: 'notification.update', notificationId: id, action: 'expire' })
      }
      onOpen={(notification) => {
        const target = (notification.target || {}) as any
        const activityId = target?.activityId || target?.hash || ''
        if (!activityId) return
        if (typeof target.account === 'string' && target.account !== shared.currentAccount) {
          void link.executeCommand({ type: 'account.select', accountId: target.account })
        }
        setSection('activity')
        openOverlay({ type: 'activity', activityId: String(activityId) })
      }}
      renderChainIcon={(notification) => {
        const chainId = Number(notification.leadingIcon?.chainId || notification.target?.chainId)
        return chainId ? (
          <ChainIcon
            chainId={chainId}
            networks={shared.networks}
            networksMeta={shared.networksMeta}
            size='medium'
          />
        ) : null
      }}
    />
  )
}
