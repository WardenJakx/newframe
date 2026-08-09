export function timestamp(value: unknown, fallback = 0): number {
  if (typeof value === 'number') return value
  if (value instanceof Date) return value.getTime()

  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) return parsed

    const numeric = Number(value)
    if (!Number.isNaN(numeric)) return numeric
  }

  return fallback
}
