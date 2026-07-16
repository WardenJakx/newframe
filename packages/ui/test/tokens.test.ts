import { describe, expect, it } from 'bun:test'
import { readFile } from 'node:fs/promises'

import { generateTokensCss, generatedTokensPath } from '../scripts/generate-tokens'

describe('generated tokens', () => {
  it('remain deterministic and fresh', async () => {
    const expected = generateTokensCss()
    expect(generateTokensCss()).toBe(expected)
    expect(await readFile(generatedTokensPath, 'utf8')).toBe(expected)
    expect(expected).toContain('--color-bg-primary: var(--color-plum-950)')
    expect(expected).toContain('--nf-font-family-body')
  })
})
