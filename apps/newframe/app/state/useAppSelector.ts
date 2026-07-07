import React from 'react'

import { getRendererStateSnapshot, subscribeToRendererState, type RendererState } from './rendererStore'

export type AppSelector<T> = (state: RendererState) => T
export type EqualityFn<T> = (previous: T, next: T) => boolean

export function shallowEqual<T>(previous: T, next: T) {
  if (Object.is(previous, next)) return true
  if (!previous || !next || typeof previous !== 'object' || typeof next !== 'object') return false

  const previousKeys = Object.keys(previous as Record<string, unknown>)
  const nextKeys = Object.keys(next as Record<string, unknown>)

  if (previousKeys.length !== nextKeys.length) return false

  return previousKeys.every((key) =>
    Object.is((previous as Record<string, unknown>)[key], (next as Record<string, unknown>)[key])
  )
}

export function useAppSelector<T>(selector: AppSelector<T>, equalityFn: EqualityFn<T> = Object.is) {
  const latestSelection = React.useRef<{ hasValue: boolean; value: T }>({
    hasValue: false,
    value: undefined as T
  })

  const getSelection = React.useCallback(() => {
    const nextSelection = selector(getRendererStateSnapshot())
    const latest = latestSelection.current

    if (latest.hasValue && equalityFn(latest.value, nextSelection)) {
      return latest.value
    }

    latestSelection.current = {
      hasValue: true,
      value: nextSelection
    }

    return nextSelection
  }, [equalityFn, selector])

  return React.useSyncExternalStore(subscribeToRendererState, getSelection, getSelection)
}
