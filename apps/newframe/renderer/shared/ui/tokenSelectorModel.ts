export const INITIAL_TOKEN_SELECTOR_ROWS = 50
export const TOKEN_SELECTOR_ROWS_INCREMENT = 50

export function getTokenSelectorPage<T>({
  getId,
  items,
  open,
  rowsVisible,
  selectedId
}: {
  getId: (item: T) => string
  items: readonly T[]
  open: boolean
  rowsVisible: number
  selectedId: string
}) {
  const visibleItems = items.slice(0, rowsVisible)
  const selectedItem = items.find((item) => getId(item) === selectedId)
  const selectedIsVisible = selectedItem ? visibleItems.some((item) => getId(item) === selectedId) : false
  const menuItems = selectedItem && !selectedIsVisible ? [selectedItem, ...visibleItems] : visibleItems

  return {
    items: open ? menuItems : selectedItem ? [selectedItem] : [],
    rowsHidden: Math.max(items.length - rowsVisible, 0)
  }
}
