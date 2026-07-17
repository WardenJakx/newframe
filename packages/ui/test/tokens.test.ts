import { describe, expect, it } from 'bun:test'
import { readFile } from 'node:fs/promises'

import { generateTokensCss, generatedTokensPath } from '../scripts/generate-tokens'
import { typographyTokens } from '../src/tokens/typography'

describe('generated tokens', () => {
  it('remain deterministic and fresh', async () => {
    const expected = generateTokensCss()
    expect(generateTokensCss()).toBe(expected)
    expect(await readFile(generatedTokensPath, 'utf8')).toBe(expected)
    expect(expected).toContain('--color-bg-primary: var(--color-plum-950)')
    expect(expected).toContain('--nf-font-family-body')
  })

  it('uses only registered font weights', () => {
    expect(typographyTokens['nf-font-weight-body']).toBe('300')
    expect(typographyTokens['nf-font-weight-regular']).toBe('300')
    expect(typographyTokens['nf-font-weight-medium']).toBe('400')
    expect(typographyTokens['nf-font-weight-bold']).toBe('500')
  })
})
