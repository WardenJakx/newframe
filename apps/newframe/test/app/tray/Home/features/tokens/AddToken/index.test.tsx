import type { Mock } from 'bun:test'
import { useState } from 'react'

import { screen, render, waitFor } from '../../../../../../componentSetup'
import link from '../../../../../../../resources/link'
import AddToken from '../../../../../../../app/tray/Home/features/tokens/AddToken'
import { resetStateMirrorForTests } from '../../../../../../../app/state/rendererStore'

const networks = {
  ethereum: {
    1: {
      id: 1,
      type: 'ethereum',
      name: 'Mainnet',
      explorer: 'https://etherscan.io',
      on: true
    },
    137: {
      id: 137,
      type: 'ethereum',
      name: 'Polygon',
      explorer: 'https://polygonscan.com',
      on: true
    }
  }
}

const networksMeta = {
  ethereum: {
    1: { primaryColor: 'accent1', nativeCurrency: { symbol: 'ETH' } },
    137: { primaryColor: 'accent7', nativeCurrency: { symbol: 'MATIC' } }
  }
}

beforeEach(() => {
  resetStateMirrorForTests({ networks, networksMeta })
})

describe('selecting token chain', () => {
  it('should display the expected chain IDs', () => {
    render(<AddToken />)

    const tokenChainNames = screen.getAllByRole('button').map((el) => el.textContent)
    expect(tokenChainNames).toEqual(['Mainnet', 'Polygon'])
  })

  it('should update add token navigation when a chain is selected', async () => {
    const onNavigate = jest.fn()
    const { user } = render(<AddToken onNavigate={onNavigate} />)

    const polygonButton = screen.getByRole('button', { name: 'Polygon' })
    await user.click(polygonButton)

    expect(onNavigate).toHaveBeenCalledWith({
      chain: {
        id: 137,
        name: 'Polygon',
        color: 'accent7'
      }
    })
  })
})

describe('setting token address', () => {
  it('should prompt for a contract address if a chain has been selected', () => {
    render(<AddToken data={{ notifyData: { chain: { id: 137 } } }} />)

    const contractAddressInput = screen.getByLabelText<HTMLInputElement>(`Enter token's address`)
    expect(contractAddressInput.textContent).toBe('')
  })

  it('should update add token navigation with an error when a user submits an invalid contract address', async () => {
    const onNavigate = jest.fn()
    const { user } = render(<AddToken data={{ notifyData: { chain: { id: 1 } } }} onNavigate={onNavigate} />)

    const contractAddressInput = screen.getByLabelText<HTMLInputElement>(`Enter token's address`)
    await user.type(contractAddressInput, 'INVALID_ADDRESS')
    const setAddressButton = screen.getByRole('button', { name: 'Set Address' })
    await user.click(setAddressButton)

    expect(onNavigate).toHaveBeenCalledWith({
      chain: { id: 1 },
      address: 'INVALID_ADDRESS',
      error: 'INVALID CONTRACT ADDRESS'
    })
  })

  it('should update add token navigation when a contracts details cannot be validated on-chain', async () => {
    ;(link.executeQuery as Mock<any>).mockImplementationOnce((query: any) => {
      expect(query).toEqual({
        type: 'token.lookup',
        address: '0x3432b6a60d23ca0dfca7761b7ab56459d9c964d0',
        chainId: 1
      })
      return { ok: false, error: 'not_found' }
    })

    const onNavigate = jest.fn()
    const { user } = render(<AddToken data={{ notifyData: { chain: { id: 1 } } }} onNavigate={onNavigate} />)

    const contractAddressLabel = screen.getByLabelText<HTMLInputElement>(`Enter token's address`)
    await user.type(contractAddressLabel, '0x3432b6a60d23ca0dfca7761b7ab56459d9c964d0')
    const setAddressButton = screen.getByRole('button', { name: 'Set Address' })
    await user.click(setAddressButton)

    expect(onNavigate).toHaveBeenCalledWith({
      chain: { id: 1 },
      address: '0x3432b6a60d23ca0dfca7761b7ab56459d9c964d0',
      error: `COULD NOT FIND TOKEN WITH ADDRESS 0x3432b6a60d23ca0dfca7761b7ab56459d9c964d0`,
      tokenData: {}
    })
  })

  it('should update add token navigation with the contract details when a valid address is entered for a connected chain', async () => {
    const mockTokenData = {
      decimals: 420,
      name: 'FAKE COIN',
      symbol: 'FAKE',
      totalSupply: '100000'
    }

    ;(link.executeQuery as Mock<any>).mockImplementationOnce((query: any) => {
      expect(query).toEqual({
        type: 'token.lookup',
        address: '0x3432b6a60d23ca0dfca7761b7ab56459d9c964d0',
        chainId: 1
      })
      return { ok: true, token: mockTokenData }
    })

    const onNavigate = jest.fn()
    const { user } = render(<AddToken data={{ notifyData: { chain: { id: 1 } } }} onNavigate={onNavigate} />)

    const contractAddressLabel = screen.getByLabelText<HTMLInputElement>(`Enter token's address`)
    await user.type(contractAddressLabel, '0x3432b6a60d23ca0dfca7761b7ab56459d9c964d0')
    const setAddressButton = screen.getByRole('button', { name: 'Set Address' })
    await user.click(setAddressButton)

    expect(onNavigate).toHaveBeenCalledWith({
      error: null,
      chain: { id: 1 },
      address: '0x3432b6a60d23ca0dfca7761b7ab56459d9c964d0',
      tokenData: mockTokenData
    })
  })
})

describe('displaying errors', () => {
  it('should allow the user to navigate back when displaying an error', () => {
    render(
      <AddToken
        data={{ notifyData: { chain: { id: 137 }, error: 'INVALID CONTRACT ADDRESS', address: '0xabc' } }}
      />
    )

    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBe(1)
    expect(buttons[0].textContent).toBe('BACK')
  })

  it(`should allow the user to proceed if we are unable to verify the token data`, () => {
    render(
      <AddToken
        data={{
          notifyData: {
            chain: { id: 137 },
            error: `COULD NOT FIND TOKEN WITH ADDRESS BLAH BLAH`,
            address: '0xabc'
          }
        }}
      />
    )

    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBe(2)
    expect(buttons[0].textContent).toBe('BACK')
    expect(buttons[1].textContent).toBe('ADD ANYWAY')
  })
})

describe('setting token details', () => {
  it('should show the user that they are editing a token', () => {
    render(
      <AddToken
        data={{
          notifyData: {
            chain: { id: 1 },
            address: '0x64aa3364F17a4D01c6f1751Fd97C2BD3D7e7f1D4',
            isEdit: true,
            tokenData: {
              decimals: 12,
              symbol: 'FAKE',
              name: 'FAKE',
              address: '0x64aa3364F17a4D01c6f1751Fd97C2BD3D7e7f1D4',
              totalSupply: '100'
            }
          }
        }}
      />
    )

    const heading = screen.getByTestId('addTokenFormTitle')
    const button = screen.getByRole('button')
    expect(heading.textContent).toBe('Edit Token')
    expect(button.textContent).toBe('Save')
  })

  it('should show the user that they are adding a token', () => {
    render(
      <AddToken
        data={{
          notifyData: { chain: { id: 1 }, address: '0x64aa3364F17a4D01c6f1751Fd97C2BD3D7e7f1D4' }
        }}
      />
    )

    const heading = screen.getByTestId('addTokenFormTitle')
    expect(heading.textContent).toBe('Add New Token')
  })

  it('should prompt to fill in missing token data', () => {
    render(
      <AddToken
        data={{
          notifyData: { chain: { id: 1 }, address: '0x64aa3364F17a4D01c6f1751Fd97C2BD3D7e7f1D4' }
        }}
      />
    )

    const button = screen.getByRole('button')
    expect(button.textContent).toBe('Fill in Token Details')
  })

  it('should show defaults in fields where token data is missing', () => {
    render(
      <AddToken
        data={{ notifyData: { chain: { id: 137 }, address: '0x64aa3364F17a4D01c6f1751Fd97C2BD3D7e7f1D4' } }}
      />
    )

    const contractAddressInput = screen.getByRole('heading')
    const tokenNameInput = screen.getByLabelText<HTMLInputElement>('Token Name')
    const tokenSymbolInput = screen.getByLabelText<HTMLInputElement>('Symbol')
    const tokenDecimalsInput = screen.getByLabelText<HTMLInputElement>('Decimals')

    expect(contractAddressInput.textContent).toEqual('0x64aa3364D7e7f1D4')
    expect(tokenNameInput.value).toEqual('Token Name')
    expect(tokenSymbolInput.value).toEqual('Symbol')
    expect(tokenDecimalsInput.value).toEqual('?')
  })

  it('should populate fields with token data', async () => {
    const mockToken = { name: 'Frame Test on Polygon', symbol: 'mFRT', decimals: 18, totalSupply: '1066' }

    render(
      <AddToken
        data={{
          notifyData: {
            chain: { id: 1 },
            address: '0x64aa3364F17a4D01c6f1751Fd97C2BD3D7e7f1D4',
            tokenData: mockToken
          }
        }}
      />
    )

    const contractAddressInput = screen.getByRole('heading')
    const tokenNameInput = screen.getByLabelText<HTMLInputElement>('Token Name')
    const tokenSymbolInput = screen.getByLabelText<HTMLInputElement>('Symbol')
    const tokenDecimalsInput = screen.getByLabelText<HTMLInputElement>('Decimals')

    expect(contractAddressInput.textContent).toEqual('0x64aa3364D7e7f1D4')
    await waitFor(() => expect(tokenNameInput.value).toEqual('Frame Test on Polygon'), { timeout: 200 })
    expect(tokenSymbolInput.value).toEqual('mFRT')
    expect(tokenDecimalsInput.value).toEqual('18')
  })

  it('should preserve a pasted logo URI when the parent rerenders with unchanged token data', async () => {
    const notifyData = {
      chain: { id: 1 },
      address: '0x64aa3364F17a4D01c6f1751Fd97C2BD3D7e7f1D4',
      tokenData: { name: 'Coinbase Wrapped BTC', symbol: 'cbBTC', decimals: 8 }
    }
    const RerenderingAddToken = () => {
      const [, setRenderCount] = useState(0)

      return (
        <>
          <button onClick={() => setRenderCount((count) => count + 1)}>Rerender parent</button>
          <AddToken data={{ notifyData: { ...notifyData, tokenData: { ...notifyData.tokenData } } }} />
        </>
      )
    }
    const { user } = render(<RerenderingAddToken />)
    const logoUriInput = screen.getByLabelText<HTMLInputElement>('Logo URI')

    await user.click(logoUriInput)
    await user.paste('https://cdn.example/cbbtc.png')
    await user.click(screen.getByRole('button', { name: 'Rerender parent' }))

    expect(logoUriInput.value).toBe('https://cdn.example/cbbtc.png')
  })
})
