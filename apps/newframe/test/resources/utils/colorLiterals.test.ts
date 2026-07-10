import { describe, expect, it } from 'bun:test'

import {
  findApplicationColorLiterals,
  findColorLiteralViolations
} from '../../../scripts/check-color-literals'

describe('color literal enforcement', () => {
  it('detects CSS, Stylus, JSX, gradients, and SVG color literals', () => {
    const source = `
.card
  background #120e14
  border 1px solid rgba(255, 255, 255, 0.1)
const style = { color: 'oklch(50% 0.2 120)' }
const icon = <path fill='#ffffff' />
`

    expect(findColorLiteralViolations(source).map(({ literal }) => literal)).toEqual([
      '#120e14',
      'rgba(255, 255, 255, 0.1)',
      'oklch(50% 0.2 120)',
      '#ffffff'
    ])
  })

  it('ignores comments, transparent, currentColor, and white-space', () => {
    const source = `
// color #ffffff
/* background rgb(0, 0, 0) */
.label
  color currentColor
  background transparent
  white-space nowrap
`

    expect(findColorLiteralViolations(source)).toEqual([])
  })

  it('finds no literals outside the canonical and generated token files', async () => {
    expect(await findApplicationColorLiterals()).toEqual([])
  })
})
