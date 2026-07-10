import { describe, expect, it } from 'bun:test'
import { readFile } from 'node:fs/promises'

import {
  chainColors,
  colorPrimitives,
  darkColorSemantics,
  resolveSemanticColor,
  resolveSystemColor,
  systemColors
} from '../../../resources/style/tokens/colors'
import { generateColorTokensCss, generatedColorTokensPath } from '../../../scripts/generate-color-tokens'

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

  it('resolves semantic, system, and chain colors from the canonical source', () => {
    expect(resolveSemanticColor('bg-primary')).toBe(colorPrimitives['plum-950'])
    expect(resolveSemanticColor('text-muted')).toBe('rgba(223, 223, 237, 0.45)')
    expect(resolveSystemColor('qr-background')).toBe(colorPrimitives.white)
    expect(chainColors.mainnet).toBe(colorPrimitives['teal-500'])
  })

  it('only references defined primitives from semantics', () => {
    for (const reference of Object.values(darkColorSemantics)) {
      const name = typeof reference === 'string' ? reference : reference.color
      expect(colorPrimitives[name]).toBeDefined()
    }
  })

  it('keeps system and chain registries on the primitive value layer', () => {
    const primitiveValues = new Set(Object.values(colorPrimitives))

    expect(Object.values(systemColors).every((value) => primitiveValues.has(value))).toBe(true)
    expect(Object.values(chainColors).every((value) => primitiveValues.has(value))).toBe(true)
  })

  it('keeps generated CSS fresh and deterministic', async () => {
    const expected = generateColorTokensCss()
    expect(generateColorTokensCss()).toBe(expected)
    expect(await readFile(generatedColorTokensPath, 'utf8')).toBe(expected)
    expect(expected).toContain('--color-bg-primary: var(--color-plum-950)')
    expect(expected).toContain('color-mix(in srgb, var(--color-teal-500) 12%, transparent)')
  })
})
