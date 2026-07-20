import React from 'react'
import { describe, expect, it, jest } from 'bun:test'

import { fireEvent, render, screen } from '../../componentSetup'
import ChainTokenIcon from '../../../resources/Components/ChainTokenIcon'
import TokenSelector from '../../../resources/Components/TokenSelector'
import type { TokenSelectorItem } from '../../../resources/Components/tokenSelectorTypes'

const networks = {
  1: { name: 'Mainnet' }
}

const networksMeta = {
  1: {
    icon: 'https://example.com/chain.png',
    primaryColor: 'accent1'
  }
}

const items: TokenSelectorItem[] = [
  {
    id: 'eth',
    symbol: 'ETH',
    amountLabel: '1.00',
    notionalLabel: '$1,000.00',
    chainId: 1
  },
  {
    id: 'long',
    symbol: 'abcDEFG',
    amountLabel: '2.00',
    notionalLabel: '$2.00',
    chainId: 1
  }
]

function ControlledSelector({ initialSelectedId = 'eth' }: { initialSelectedId?: string }) {
  const [open, setOpen] = React.useState(false)
  const [selectedId, setSelectedId] = React.useState(initialSelectedId)

  return (
    <div>
      <TokenSelector
        ariaLabel='Choose token'
        items={items}
        networks={networks}
        networksMeta={networksMeta}
        onOpenChange={setOpen}
        onSelect={setSelectedId}
        open={open}
        selectedId={selectedId}
      />
      <button type='button'>outside</button>
    </div>
  )
}

describe('ChainTokenIcon', () => {
  it('delegates fallback chain-badge color to the design-system recipe', () => {
    render(
      <ChainTokenIcon
        chainId={1}
        networks={{ 1: { name: 'Newframe Local Anvil' } }}
        networksMeta={{ 1: { primaryColor: 'accent1' } }}
        size='md'
        symbol='USDC'
      />
    )

    const dot = document.querySelector('[data-tone="accent"]') as HTMLElement
    expect(dot).not.toBeNull()
    expect(dot.getAttribute('style')).toBeNull()
  })

  it('uses the first 5 symbol characters as the token image fallback', () => {
    render(
      <ChainTokenIcon
        chainId={1}
        networks={networks}
        networksMeta={networksMeta}
        size='md'
        symbol='abcDEFG'
      />
    )

    expect(screen.getByText('abcDE')).toBeTruthy()
  })

  it('falls back and warns when a token image fails to load', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})

    render(
      <ChainTokenIcon
        chainId={1}
        logoURI='https://example.com/token.png'
        networks={networks}
        networksMeta={networksMeta}
        size='md'
        symbol='BROKEN'
      />
    )

    const tokenImage = document.querySelectorAll('img')[0] as HTMLImageElement
    fireEvent.error(tokenImage)

    expect(screen.getByText('BROKE')).toBeTruthy()
    expect(warn).toHaveBeenCalledWith(
      '[ChainTokenIcon] failed to load token image',
      expect.objectContaining({ chainId: 1, symbol: 'BROKEN', url: 'https://example.com/token.png' })
    )
    warn.mockRestore()
  })
})

describe('TokenSelector', () => {
  it('selects highlighted items with the keyboard', async () => {
    const { user } = render(<ControlledSelector />)

    await user.click(screen.getByRole('button', { name: 'Choose token' }))
    fireEvent.keyDown(screen.getByRole('button', { name: 'Choose token' }), { key: 'ArrowDown' })
    fireEvent.keyDown(screen.getByRole('button', { name: 'Choose token' }), { key: 'Enter' })

    expect(screen.getByRole('button', { name: 'Choose token' }).textContent).toContain('abcDEFG')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('closes when clicking outside', async () => {
    const { user } = render(<ControlledSelector />)

    await user.click(screen.getByRole('button', { name: 'Choose token' }))
    expect(screen.getByRole('listbox')).toBeTruthy()

    fireEvent.mouseDown(screen.getByRole('button', { name: 'outside' }))

    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('warns and renders the placeholder when selectedId is not in items', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})

    render(<ControlledSelector initialSelectedId='missing' />)

    expect(screen.getByRole('button', { name: 'Choose token' }).textContent).toContain('Select token')
    expect(warn).toHaveBeenCalledWith(
      '[TokenSelector] selectedId was not found in items',
      expect.objectContaining({ selectedId: 'missing' })
    )
    warn.mockRestore()
  })
})
