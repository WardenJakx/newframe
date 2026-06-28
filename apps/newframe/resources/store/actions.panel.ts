// Panel view actions

type Updater = (...args: any[]) => void

let trayInitial = true

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
