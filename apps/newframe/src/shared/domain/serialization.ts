export function cloneSerializable<T>(value: T): T | undefined {
  if (value === undefined) {
    return undefined
  }

  try {
    return JSON.parse(
      JSON.stringify(value, (_key, nextValue: unknown) => {
        if (typeof nextValue === 'function') {
          return undefined
        }
        return nextValue
      })
    ) as T
  } catch {
    return undefined
  }
}
