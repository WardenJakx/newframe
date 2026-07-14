// Panel view actions. These are private canonical-store mutations, not renderer commands.

import type { Draft } from 'immer'

import type { CanonicalState } from '../../main/store/state'

export type CanonicalSet = (update: (state: Draft<CanonicalState>) => void) => void
export type CanonicalGet = () => CanonicalState

type NotificationState = 'pending' | 'completed' | 'failed'
type MutableRecord = Record<string, any>
type MutableCanonicalState = Omit<Draft<CanonicalState>, 'view'> & {
  view: MutableRecord & { notifications: Record<string, MutableRecord> }
}

let trayInitial = true
const resolvedNotificationStates = new Set<NotificationState>(['completed', 'failed'])

const mutable = (state: Draft<CanonicalState>) => state as unknown as MutableCanonicalState

export function createPanelActions(set: CanonicalSet, _get: CanonicalGet) {
  return {
    notify: (type: string, data: any = {}) => {
      set((draft) => {
        const state = mutable(draft)
        state.view.notify = type
        state.view.notifyData = data
      })
    },

    upsertPendingNotification: (notification: any) => {
      const id = notification?.id
      if (!id) return

      const now = Date.now()

      set((draft) => {
        const notifications = mutable(draft).view.notifications
        const existingNotification = notifications[id] || {}
        const pendingNotification = {
          ...existingNotification,
          ...notification,
          id,
          state: 'pending',
          createdAt: notification.createdAt ?? existingNotification.createdAt ?? now,
          updatedAt: notification.updatedAt ?? now,
          hidden: notification.hidden ?? false
        }

        if (notification.dismissedAt === undefined) delete pendingNotification.dismissedAt
        notifications[id] = pendingNotification
      })
    },

    resolveNotification: (id: string, state: Exclude<NotificationState, 'pending'>, update: any = {}) => {
      if (!id || !resolvedNotificationStates.has(state)) return

      const now = Date.now()

      set((draft) => {
        const notifications = mutable(draft).view.notifications
        const notification = notifications[id]
        if (!notification) return

        const resolvedNotification = {
          ...notification,
          ...update,
          id,
          state,
          hidden: update.hidden ?? false,
          updatedAt: update.updatedAt ?? now
        }

        if (update.dismissedAt === undefined) delete resolvedNotification.dismissedAt
        notifications[id] = resolvedNotification
      })
    },

    dismissNotification: (id: string, update: any = {}) => {
      if (!id) return

      const dismissedAt = update.dismissedAt ?? Date.now()

      set((draft) => {
        const notifications = mutable(draft).view.notifications
        const notification = notifications[id] || { id }
        notifications[id] = {
          ...notification,
          ...update,
          id,
          state: update.state ?? notification.state ?? 'pending',
          hidden: true,
          dismissedAt,
          updatedAt: update.updatedAt ?? dismissedAt
        }
      })
    },

    expireNotification: (id: string) => {
      if (!id) return

      set((draft) => {
        delete mutable(draft).view.notifications[id]
      })
    },

    updateBadge: (type: string, version: any) => {
      set((draft) => {
        mutable(draft).view.badge = { type, version }
      })
    },

    trayOpen: (open: boolean) => {
      const clearInitial = open && trayInitial
      if (clearInitial) trayInitial = false

      set((draft) => {
        mutable(draft).tray.open = open
      })

      if (clearInitial) {
        setTimeout(() => {
          set((draft) => {
            mutable(draft).tray.initial = false
          })
        }, 30)
      }
    }
  }
}

export type PanelActions = ReturnType<typeof createPanelActions>
