import { describe, expect, it } from 'bun:test'

import { findColorLiteralViolations } from './check-color-literals'

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

  it('rejects named colors and primitive, default-palette, and unknown token bypasses', () => {
    const source = `
const style = { color: 'rebeccapurple', background: 'plum-950', borderColor: 'red.500' }
const icon = <path stroke='white' />
.card { background: blue; border: 1px solid red; }
const vars = ['var(--colors-plum-950)', 'token(colors.red.500)', '{colors.bg.missing}']
const custom = { '--custom-color': 'pink' }
import { colorPrimitives } from '@newframe/ui/tokens/colors'
const helpers = [token.var('colors.plum-950'), token('colors.red.500')]
const template = { color: \`rebeccapurple\` }
const shorthand = { border: '1px solid red' }
`
    expect(findColorLiteralViolations(source).map(({ literal }) => literal)).toEqual([
      'rebeccapurple',
      'plum-950',
      'red.500',
      'white',
      'blue',
      'red',
      'var(--colors-plum-950)',
      'token(colors.red.500)',
      '{colors.bg.missing}',
      'pink',
      'colorPrimitives',
      "'colors.plum-950'",
      "'colors.red.500'",
      'rebeccapurple',
      'red'
    ])
  })

  it('accepts semantic tokens, shadows, metadata bridges, and component variant props', () => {
    const source = `
const style = { color: 'status.success', background: 'bg.primary', borderColor: 'border' }
const shadow = { boxShadow: 'elevation-overlay', fill: 'none', stroke: 'currentColor' }
const vars = ['var(--colors-status-success)', 'token(colors.border)', '{colors.text.primary}']
const helpers = [token.var('colors.status.success'), token('colors.bg.primary')]
const template = { color: \`text.primary\` }
const chain = { color: 'var(--chain-icon-color)' }
const component = <Surface border='subtle'><Text tone='accent' /></Surface>
type Model = { border: 'danger' | 'special'; color: string }
`
    expect(findColorLiteralViolations(source)).toEqual([])
  })

  it('keeps literals after URL strings and reports multiline colors at their source location', () => {
    const source = `const url = 'https://example.com'; const style = { color: '#fff' }
// color: '#000'
/* background: 'red'
   color: '#000' */
const style = { color: 'rgb(
  1, 2, 3)' }
`
    expect(findColorLiteralViolations(source)).toEqual([
      { column: 60, line: 1, literal: '#fff' },
      { column: 25, line: 5, literal: 'rgb(\n  1, 2, 3)' }
    ])
  })
})
