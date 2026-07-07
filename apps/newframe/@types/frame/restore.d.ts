interface Observer {
  remove: () => void
}

interface Action {
  updates: any[]
}

declare type CallableStore = (...args: any[]) => any

interface Store extends CallableStore {
  observer: (cb: () => void, id?: string) => Observer
  [actionName: string]: (...args: any) => void
  api: {
    feed: (handler: (state: any, actionBatch: Action[]) => any) => void
  }
}

declare module 'react-restore' {
  export function create(state: any, actions: any): Store
  /**
   * @deprecated Legacy render-tracking bridge. New React components should use
   * app/state/useAppSelector with typed selectors instead of Restore.connect.
   */
  export function connect<T>(component: T, store?: Store): T
  const Restore: {
    create: typeof create
    connect: typeof connect
  }
  export default Restore
}
