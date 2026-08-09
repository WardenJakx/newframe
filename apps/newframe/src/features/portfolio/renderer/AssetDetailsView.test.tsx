import { afterEach, beforeEach, describe, expect, it, jest as timers } from 'bun:test'

import { act, render, screen } from '../../../../test/support/componentSetup'
import { createHostFixture } from '../../../../test/support/rendererClient'
import { AssetDetailsView } from './AssetDetailsView'
import { NATIVE_CURRENCY } from '../../tokens/domain/constants'
import type { DisplayedBalance } from '../../asset-data/domain/balance'
import { shortAddress } from '../../../shared/renderer/ui/AddressIdentity'

const address = '0xaf88d065e77c8cc2239327c5edb3a432268e5831'
const networks = { 42161: { name: 'Arbitrum' } }
const networksMeta = { 42161: {} }
const linkMock = createHostFixture()

beforeEach(() => {
  timers.useFakeTimers()
})

afterEach(() => {
  timers.useRealTimers()
})

function assetWithAddress(assetAddress: string): DisplayedBalance {
  return {
    address: assetAddress,
    balance: '102000066',
    chainId: 42161,
    decimals: 6,
    displayBalance: '102.000066',
    displayValue: '0',
    hasPrice: true,
    name: 'USD Coin',
    price: '0.00',
    priceChange: false,
    symbol: 'USDC',
    totalValue: 0,
    rate: { change24hr: 0, source: 'fixed', usdRate: 0 }
  }
}

function renderAsset(assetAddress = address) {
  return render(
    <AssetDetailsView
      asset={assetWithAddress(assetAddress)}
      canSend
      canTrade
      networks={networks}
      networksMeta={networksMeta}
      onBack={() => {}}
      onSend={() => {}}
      onTrade={() => {}}
    />,
    { advanceTimersAfterInput: 0 }
  )
}

describe('AssetDetailsView contract address', () => {
  it('renders a missing individual asset rate as unknown', () => {
    const asset = assetWithAddress(address)
    asset.hasPrice = false
    asset.rate = undefined

    render(
      <AssetDetailsView
        asset={asset}
        canSend
        canTrade
        networks={networks}
        networksMeta={networksMeta}
        onBack={() => {}}
        onSend={() => {}}
        onTrade={() => {}}
      />
    )

    expect(screen.getByText('—')).toBeTruthy()
  })

  it('copies a token contract from the row and briefly confirms the copy', async () => {
    const { user } = renderAsset()

    await user.click(screen.getByRole('button', { name: `Copy address for ${shortAddress(address)}` }))

    expect(linkMock.executeCommand).toHaveBeenCalledWith({
      type: 'clipboard.write',
      text: address
    })
    expect(screen.getByRole('button', { name: `Address copied for ${shortAddress(address)}` })).toBeTruthy()

    act(() => timers.advanceTimersByTime(1000))

    expect(screen.getByRole('button', { name: `Copy address for ${shortAddress(address)}` })).toBeTruthy()
  })

  it('keeps native assets non-interactive', () => {
    renderAsset(NATIVE_CURRENCY)

    expect(screen.getByText('Native asset')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Copy address/ })).toBeNull()
  })
})
