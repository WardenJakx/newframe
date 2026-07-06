// Panel view actions

type Updater = (...args: any[]) => void
type NotificationState = 'pending' | 'completed' | 'failed'

let trayInitial = true
const resolvedNotificationStates = new Set(['completed', 'failed'])

export const stateSync = (u: Updater, _actions: string) => {
  try {
    const actions = JSON.parse(_actions)
    actions.forEach((action: { updates: { path: string; value: any }[] }) => {
      action.updates.forEach((update) => {
        u(update.path, () => update.value)
      })
    })
  } catch (e) {
    console.error('State Syncing Error', e)
  }
}
export const syncPanel = (u: Updater, panel: any) => u('panel', () => panel)
export const notify = (u: Updater, type: string, data = {}) => {
  u('view.notify', () => type)
  u('view.notifyData', () => data)
}
export const upsertPendingNotification = (u: Updater, notification: any) => {
  const id = notification?.id
  if (!id) return

  const now = Date.now()

  u('view.notifications', id, (existingNotification: any = {}) => {
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

    return pendingNotification
  })
}
export const resolveNotification = (
  u: Updater,
  id: string,
  state: Exclude<NotificationState, 'pending'>,
  update: any = {}
) => {
  if (!id) return
  if (!resolvedNotificationStates.has(state)) return

  const now = Date.now()

  u('view.notifications', id, (notification: any) => {
    if (!notification) return notification

    const resolvedNotification = {
      ...notification,
      ...update,
      id,
      state,
      hidden: update.hidden ?? false,
      updatedAt: update.updatedAt ?? now
    }

    if (update.dismissedAt === undefined) delete resolvedNotification.dismissedAt

    return resolvedNotification
  })
}
export const dismissNotification = (u: Updater, id: string, update: any = {}) => {
  if (!id) return

  const dismissedAt = update.dismissedAt ?? Date.now()

  u('view.notifications', id, (notification: any = { id }) => ({
    ...notification,
    ...update,
    id,
    state: update.state ?? notification.state ?? 'pending',
    hidden: true,
    dismissedAt,
    updatedAt: update.updatedAt ?? dismissedAt
  }))
}
export const expireNotification = (u: Updater, id: string) => {
  if (!id) return

  u('view.notifications', (notifications: any = {}) => {
    const nextNotifications = { ...notifications }
    delete nextNotifications[id]
    return nextNotifications
  })
}
export const updateBadge = (u: Updater, type: string, version: any) =>
  u('view.badge', () => ({ type, version }))
export const setPanelView = (u: Updater, view: string) => u('panel.view', () => view)
export const trayOpen = (u: Updater, open: boolean) => {
  u('tray.open', () => open)
  if (open && trayInitial) {
    trayInitial = false
    setTimeout(() => {
      u('tray.initial', () => false)
    }, 30)
  }
}
export const setSignerView = (u: Updater, view: string) => {
  u('selected.showAccounts', () => false)
  u('selected.view', () => view)
}
