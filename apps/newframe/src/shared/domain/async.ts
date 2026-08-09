export type Debounced<TArgs extends unknown[]> = ((...args: TArgs) => void) & {
  cancel(): void
}

export function debounce<TArgs extends unknown[]>(
  fn: (...args: TArgs) => unknown,
  timeout = 300
): Debounced<TArgs> {
  let timer: ReturnType<typeof setTimeout> | undefined

  const debounced = (...args: TArgs) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      fn(...args)
    }, timeout)
  }

  debounced.cancel = () => {
    if (timer) clearTimeout(timer)
    timer = undefined
  }

  return debounced
}
