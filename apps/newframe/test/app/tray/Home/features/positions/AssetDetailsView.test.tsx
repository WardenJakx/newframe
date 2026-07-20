import { act, render, screen } from '../../../../../componentSetup'
import { linkMock } from '../../../../../bun.mocks'
import { AssetDetailsView } from '../../../../../../app/tray/Home/features/positions/AssetDetailsView'
import { NATIVE_CURRENCY } from '../../../../../../resources/constants'
import type { DisplayedBalance } from '../../../../../../resources/domain/balance'

const address = '0xaf88d065e77c8cc2239327c5edb3a432268e5831'
const networks = { 42161: { name: 'Arbitrum' } }
const networksMeta = { 42161: {} }

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
    usdRate: { change24hr: 0, price: 0 }
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
    />
  )
}

describe('AssetDetailsView contract address', () => {
  it('copies a token contract from the row and briefly confirms the copy', async () => {
    const { user } = renderAsset()

    await user.click(screen.getByRole('button', { name: 'Copy USDC contract address' }))

    expect(linkMock.executeCommand).toHaveBeenCalledWith({
      type: 'clipboard.write',
      text: address
    })
    expect(screen.getByText('Address copied')).toBeTruthy()

    act(() => jest.advanceTimersByTime(1000))

    expect(screen.getByText(address)).toBeTruthy()
  })

  it('keeps native assets non-interactive', () => {
    renderAsset(NATIVE_CURRENCY)

    expect(screen.getByText('Native asset')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Copy USDC contract address' })).toBeNull()
  })
})
