import { describe, expect, it } from 'bun:test'

import { getTokenSelectorPage } from '../../../resources/Components/tokenSelectorModel'

const items = Array.from({ length: 120 }, (_, index) => ({ id: String(index) }))

describe('token selector model', () => {
  it('materializes only the selected item while closed', () => {
    const page = getTokenSelectorPage({
      getId: (item) => item.id,
      items,
      open: false,
      rowsVisible: 50,
      selectedId: '75'
    })

    expect(page.items).toEqual([{ id: '75' }])
    expect(page.rowsHidden).toBe(70)
  })

  it('paginates open menus while retaining a selected item outside the page', () => {
    const page = getTokenSelectorPage({
      getId: (item) => item.id,
      items,
      open: true,
      rowsVisible: 50,
      selectedId: '75'
    })

    expect(page.items).toHaveLength(51)
    expect(page.items[0]).toEqual({ id: '75' })
    expect(page.rowsHidden).toBe(70)
  })
})
