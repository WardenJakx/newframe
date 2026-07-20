import { describe, expect, it } from 'bun:test'

import { typographyTokens } from '../src/tokens/typography'
import { layerTokens } from '../src/tokens/layers'

describe('design tokens', () => {
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
