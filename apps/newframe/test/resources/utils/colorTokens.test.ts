import { describe, expect, it } from 'bun:test'
import {
  colorPrimitives,
  darkColorSemantics,
  resolveSemanticColor,
  resolveSystemColor,
  systemColors
} from '@newframe/ui/tokens/colors'

import { chainColors, chainColorValue } from '../../../resources/colors'

describe('color tokens', () => {
  it('defines the six-level plum surface scale', () => {
    expect(Object.keys(colorPrimitives).filter((name) => name.startsWith('plum-'))).toEqual([
      'plum-500',
      'plum-600',
      'plum-700',
      'plum-800',
      'plum-900',
      'plum-950'
    ])
  })

  it('resolves semantic and system colors from the shared canonical source', () => {
    expect(resolveSemanticColor('bg-primary')).toBe(colorPrimitives['plum-950'])
    expect(resolveSemanticColor('text-muted')).toBe('rgba(223, 223, 237, 0.45)')
    expect(resolveSystemColor('qr-background')).toBe(colorPrimitives.white)
    expect(chainColors.mainnet).toBe('#00d2be')
    expect(chainColorValue('accent1')).toBe(chainColors.mainnet)
    expect(chainColorValue('#123456')).toBe('#123456')
  })

  it('only references defined primitives from semantics', () => {
    for (const reference of Object.values(darkColorSemantics)) {
      const name = typeof reference === 'string' ? reference : reference.color
      expect(colorPrimitives[name]).toBeDefined()
    }
  })

  it('keeps the shared system registry on the primitive value layer', () => {
    const primitiveValues = new Set(Object.values(colorPrimitives))

    expect(Object.values(systemColors).every((value) => primitiveValues.has(value))).toBe(true)
  })
})
