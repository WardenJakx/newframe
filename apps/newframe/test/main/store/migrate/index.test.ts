import { describe, expect, it } from 'bun:test'

import migrations from '../../../../main/store/migrate'

describe('store migrations', () => {
  it('normalizes persisted light colorways to dark', () => {
    const state = { main: { _version: 1, colorway: 'light' } }

    expect(migrations.apply(state)).toEqual({ main: { _version: 2, colorway: 'dark' } })
  })

  it('keeps dark colorways dark', () => {
    const state = { main: { _version: 1, colorway: 'dark' } }

    expect(migrations.apply(state)).toEqual({ main: { _version: 2, colorway: 'dark' } })
  })
})
