// Panel view actions

import { v4 } from 'uuid'
import { URL } from 'url'

type Updater = (...args: any[]) => void

let trayInitial = true

export const updateAccountModule = (u: Updater, id: string, update: any) => {
  u('panel.account.modules', id, (module = {}) => {
    return Object.assign(module, update)
  })
}
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
export const setSigner = (u: Updater, signer: { id: string }) => {
  u('selected.current', () => signer.id)
  u('selected.minimized', () => false)
  u('selected.open', () => true)
}
export const setSettingsView = (u: Updater, index: number, subindex = 0) => {
  u('selected.settings.viewIndex', () => index)
  u('selected.settings.subIndex', () => subindex)
}
export const setAddress = (u: Updater, address: string) => u('address', () => address)
export const togglePanel = (u: Updater) => u('panel.show', (show: boolean) => !show)
export const panelRequest = (u: Updater, request: any) => {
  request.host = request.host || new URL(request.url).host
  u('panel.request', () => request)
  u('panel.show', () => true)
}
export const setBalance = (u: Updater, account: string, balance: any) => u('balances', account, () => balance)
export const notify = (u: Updater, type: string, data = {}) => {
  u('view.notify', () => type)
  u('view.notifyData', () => data)
}
export const clickGuard = (u: Updater, on: boolean) => u('view.clickGuard', () => on)
export const toggleAddAccount = (u: Updater) => u('view.addAccount', (show: boolean) => !show)
export const toggleAddNetwork = (u: Updater) => u('view.addNetwork', (show: boolean) => !show)
export const updateBadge = (u: Updater, type: string, version: any) =>
  u('view.badge', () => ({ type, version }))
export const toggleSettings = (u: Updater) => {
  u('panel.view', (view: string) => (view === 'settings' ? 'default' : 'settings'))
}
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
export const accountPage = (u: Updater, page: any) => {
  u('selected.accountPage', () => page)
}
export const toggleShowAccounts = (u: Updater) => u('selected.showAccounts', (_: boolean) => !_)
export const addProviderEvent = (u: Updater, payload: { method: string }) => {
  u('provider.events', (events: string[]) => {
    events.push(payload.method)
    return events
  })
}
export const setView = (u: Updater, view: string) => u('selected.view', () => view)
export const toggleDataView = (u: Updater, id: string) => {
  u('selected.requests', id, 'viewData', (view: boolean) => !view)
}
export const updateExternalRates = (u: Updater, rates: any) => u('main.rates', () => rates)
export const resetSigner = (u: Updater) => {
  u('selected.view', () => 'default')
  u('selected.showAccounts', () => false)
}
export const unsetSigner = (u: Updater) => {
  u('selected.minimized', () => true)
  u('selected.open', () => false)
  resetSigner(u)
  setTimeout(() => {
    u('selected', (signer: any) => {
      signer.last = signer.current
      signer.current = ''
      signer.requests = {}
      signer.view = 'default'
      return signer
    })
  }, 520)
}
export const nodeProvider = (u: Updater, connected: boolean) => u('node.provider', () => connected)
export const setCurrent = (u: Updater, id: string) => u('view.current', () => id)
export const updateUrl = (u: Updater, id: string, url: string) => u('view.data', id, 'url', () => url)
export const updateTitle = (u: Updater, id: string, title: string) => u('view.data', id, 'title', () => title)
export const reorderTabs = (u: Updater, from: number, to: number) => {
  u('view.list', (list: string[]) => {
    const _from = list[from]
    list[from] = list[to]
    list[to] = _from
    return list
  })
}
export const newView = (u: Updater) => {
  const id = v4()
  u('view.current', () => id)
  u('view.list', (list: string[]) => {
    list.push(id)
    return list
  })
  u('view.data', id, () => ({ url: 'https://www.google.com/', title: 'New Tab' }))
}
export const removeView = (u: Updater, id: string, isCurrent: boolean) => {
  u('view', (view: { list: string[]; current: string; data: Record<string, any> }) => {
    const index = view.list.indexOf(id)
    if (isCurrent) {
      if (index < view.list.length - 1) {
        view.current = view.list[index + 1]
      } else {
        view.current = view.list[index - 1]
      }
    }
    if (index > -1) view.list.splice(index, 1)
    delete view.data[id]
    return view
  })
}
export const initialSignerPos = (u: Updater, pos: any) => u('selected.position.initial', () => pos)
export const initialScrollPos = (u: Updater, pos: any) => u('selected.position.scrollTop', () => pos)
