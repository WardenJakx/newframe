export function randomLetters(length: number) {
  return [...Array(length)].map(() => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('')
}

export function capitalize(value: string) {
  if (!value) return value
  return value[0].toUpperCase() + value.substring(1).toLowerCase()
}

export const matchFilter = (filter = '', properties: string[] = []) => {
  if (!filter) return true

  const filterItems = filter.split(' ')
  const matchableProperties = properties.filter(Boolean).map((property) => property.toLowerCase())

  return filterItems.every((item) =>
    matchableProperties.some((property) => property.includes(item.toLowerCase()))
  )
}
