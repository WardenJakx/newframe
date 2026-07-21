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
    searchText: 'Long Token 0x1234',
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
  it('renders persisted chain artwork from its base64 image record', () => {
    render(
      <ChainTokenIcon
        chainId={1}
        networks={networks}
        networksMeta={{
          1: {
            image: { base64: 'aWNvbg==', mimeType: 'image/png' },
            primaryColor: 'accent1'
          }
        }}
        size='md'
        symbol='ETH'
      />
    )

    expect(document.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,aWNvbg==')
  })

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

  it('falls back without rendering retired image-cache references', () => {
    render(
      <ChainTokenIcon
        chainId={1}
        logoURI='frame-cache:icon:token'
        networks={{ 1: { name: 'Newframe Local Anvil' } }}
        networksMeta={{ 1: { icon: 'frame-cache:icon:chain', primaryColor: 'accent1' } }}
        size='md'
        symbol='USDC'
      />
    )

    expect(screen.getByText('USDC')).toBeTruthy()
    expect(document.querySelector('img')).toBeNull()
  })

  it('falls back and warns when a token image fails to load', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})

    render(
      <ChainTokenIcon
        chainId={1}
        logoURI='data:image/png;base64,YnJva2Vu'
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
      expect.objectContaining({ chainId: 1, symbol: 'BROKEN', url: 'data:image/png;base64,YnJva2Vu' })
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

  it('filters tokens by metadata and keeps the menu open when there are no matches', async () => {
    const { user } = render(<ControlledSelector />)

    await user.click(screen.getByRole('button', { name: 'Choose token' }))
    await user.type(screen.getByLabelText('Search tokens'), 'long token')

    expect(screen.getAllByRole('option')).toHaveLength(1)
    expect(screen.getByRole('option').textContent).toContain('abcDEFG')

    await user.clear(screen.getByLabelText('Search tokens'))
    await user.type(screen.getByLabelText('Search tokens'), 'missing')

    expect(screen.getByRole('listbox')).toBeTruthy()
    expect(screen.queryAllByRole('option')).toHaveLength(0)
    expect(screen.getByText('No tokens found')).toBeTruthy()
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
