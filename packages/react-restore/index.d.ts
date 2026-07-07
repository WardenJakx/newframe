// Self-contained type surface for the vendored react-restore module.
// State shapes are app-defined, so the store is intentionally loose.

export interface Store {
  (...args: any[]): any
  [key: string]: any
}

export function create(state: any, actions?: any): Store

/**
 * @deprecated Legacy render-tracking bridge. New React components should use
 * app/state/useAppSelector with typed selectors instead of Restore.connect.
 */
export function connect<T>(component: T, store?: Store): T

declare const Restore: {
  create: typeof create
  connect: typeof connect
}

export default Restore
