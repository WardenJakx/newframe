// Type surface for the vendored react-restore module. Mirrors the ambient
// Store/Observer/Action types declared in @types/frame/restore.d.ts.

export function create(state: any, actions: any): Store

export function connect<T>(component: T, store?: Store): T

declare const Restore: {
  create: typeof create
  connect: typeof connect
}

export default Restore
