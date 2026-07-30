import { describe, expect, it } from 'bun:test'

import { render, screen } from '../../../../../test/support/componentSetup'
import { formatPortfolioValue } from './PortfolioHero'
import { PortfolioHeroView } from './PortfolioHeroView'

const noop = () => {}

function renderHero(displayValue: string) {
  render(
    <PortfolioHeroView
      canSend
      canTrade
      displayValue={displayValue}
      onRefresh={noop}
      onSend={noop}
      onTrade={noop}
      refreshing={false}
    />
  )
}

describe('PortfolioHero', () => {
  it('renders exactly an em dash when all holdings have unknown rates', () => {
    const displayValue = formatPortfolioValue([
      { hasPrice: false, totalValue: 0 },
      { hasPrice: false, totalValue: 0 }
    ])

    renderHero(displayValue)

    expect(screen.getByRole('group', { name: 'Portfolio value' }).textContent).toBe('—')
  })

  it('preserves the known subtotal when only some holdings have rates', () => {
    const displayValue = formatPortfolioValue([
      { hasPrice: true, totalValue: 12.34 },
      { hasPrice: false, totalValue: 0 }
    ])

    renderHero(displayValue)

    expect(screen.getByRole('group', { name: 'Portfolio value' }).textContent).toBe('$12.34')
  })
})
