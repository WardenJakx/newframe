import { describe, expect, it } from 'bun:test'

import { token } from '../src/styled-system/tokens/index'
import { layerTokens } from '../src/tokens/layers.ts'
import { typographyTokens } from '../src/tokens/typography.ts'

describe('design tokens', () => {
  it('preserves public color aliases alongside nested semantic roles', () => {
    expect(token.var('colors.border')).toBe('var(--colors-border)')
    expect(token.var('colors.border.focus')).toBe('var(--colors-border-focus)')
    expect(token.var('colors.shadow')).toBe('var(--colors-shadow)')
    expect(token.var('colors.action.primary')).toBe('var(--colors-action-primary)')
    expect(token.var('colors.action.primary.text')).toBe('var(--colors-action-primary-text)')
    expect(token.var('colors.status.warning.border')).toBe('var(--colors-status-warning-border)')
    expect(token.var('colors.qr.foreground')).toBe('var(--colors-qr-foreground)')
    expect(token.var('colors.scrim')).toBe('var(--colors-scrim)')
  })

  it('uses only registered font weights', () => {
    expect(typographyTokens['nf-font-weight-body']).toBe('300')
    expect(typographyTokens['nf-font-weight-regular']).toBe('300')
    expect(typographyTokens['nf-font-weight-medium']).toBe('400')
    expect(typographyTokens['nf-font-weight-bold']).toBe('500')
  })
})

describe('layer tokens', () => {
  it('keeps blocking dialogs above app overlays', () => {
    expect(Number(layerTokens['nf-layer-modal'])).toBeGreaterThan(Number(layerTokens['nf-layer-overlay']))
  })
})
