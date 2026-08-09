import { beforeEach, describe, expect, it, mock } from 'bun:test'

import type { Mock } from 'bun:test'
import { useState } from 'react'

import { act, screen, render, waitFor } from '../../../../../test/support/componentSetup'
import { createHostFixture } from '../../../../../test/support/rendererClient'
import AddToken from './index'
import { resetStateMirrorForTests } from '../../../../platform/state-sync/renderer/rendererStore'
import { walletState } from '../../../../platform/state-sync/renderer/fixtures.test-support.ts'
import { toTokenId } from '../../domain'
import type { OperationRecord } from '../../../../platform/operations/operation'
import type { TokenAddCommand } from '../../../../app/contracts/operations'

const link = createHostFixture()

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
  it('should display the expected chains and update navigation when one is selected', async () => {
    const onNavigate = mock()
    const { user } = render(<AddToken onNavigate={onNavigate} />)
    const tokenChainNames = screen.getAllByRole('button').map((el) => el.textContent)
    expect(tokenChainNames).toEqual(['Mainnet', 'Polygon'])

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
    const onNavigate = mock()
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

    const onNavigate = mock()
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

    const onNavigate = mock()
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
  it('allows back navigation and permits unverified token data to continue', () => {
    const view = render(
      <AddToken
        data={{ notifyData: { chain: { id: 137 }, error: 'INVALID CONTRACT ADDRESS', address: '0xabc' } }}
      />
    )

    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBe(1)
    expect(buttons[0].textContent).toBe('BACK')
    view.unmount()

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

    const continueButtons = screen.getAllByRole('button')
    expect(continueButtons.length).toBe(2)
    expect(continueButtons[0].textContent).toBe('BACK')
    expect(continueButtons[1].textContent).toBe('ADD ANYWAY')
  })
})

describe('setting token details', () => {
  it('waits for projected completion, surfaces safe failure, and permits a retry with a new operation', async () => {
    const address = '0x64aa3364F17a4D01c6f1751Fd97C2BD3D7e7f1D4'
    const tokenData = { name: 'Frame Test', symbol: 'FRT', decimals: 18 }
    const onDone = mock()
    ;(link.executeCommand as Mock<any>)
      .mockResolvedValueOnce({ ok: false, error: 'internal', message: 'Could not submit this token.' })
      .mockResolvedValue({ ok: true })
    const { user } = render(
      <AddToken data={{ notifyData: { chain: { id: 1 }, address, tokenData } }} onDone={onDone} />
    )

    await user.click(screen.getByRole('button', { name: 'Add Token' }))
    const firstCommand = (link.executeCommand as Mock<any>).mock.calls.at(-1)![0] as TokenAddCommand
    expect(firstCommand).toEqual({
      type: 'token.add',
      operationId: expect.any(String),
      token: { ...tokenData, address, chainId: 1, logoURI: '' }
    })
    expect(onDone.mock.calls.length).toBe(0)
    expect(await screen.findByText('Could not submit this token.')).toBeTruthy()
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Add Token' }).disabled).toBe(false)
    act(() => {
      resetStateMirrorForTests(
        walletState({
          operations: {
            [firstCommand.operationId]: {
              id: firstCommand.operationId,
              type: firstCommand.type,
              status: 'succeeded',
              startedAt: 1,
              updatedAt: 2,
              finishedAt: 2
            } satisfies OperationRecord
          }
        })
      )
    })
    expect(onDone.mock.calls.length).toBe(0)

    await user.click(screen.getByRole('button', { name: 'Add Token' }))
    const secondCommand = (link.executeCommand as Mock<any>).mock.calls.at(-1)![0] as TokenAddCommand
    expect(secondCommand.operationId).not.toBe(firstCommand.operationId)

    act(() => {
      resetStateMirrorForTests(
        walletState({
          operations: {
            [secondCommand.operationId]: {
              id: secondCommand.operationId,
              type: secondCommand.type,
              status: 'failed',
              error: { code: 'token_add_failed', message: 'Could not save this token.' },
              startedAt: 1,
              updatedAt: 2,
              finishedAt: 2
            } satisfies OperationRecord
          }
        })
      )
    })
    expect(await screen.findByText('Could not save this token.')).toBeTruthy()
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Add Token' }).disabled).toBe(false)

    await user.click(screen.getByRole('button', { name: 'Add Token' }))
    const thirdCommand = (link.executeCommand as Mock<any>).mock.calls.at(-1)![0] as TokenAddCommand
    expect(thirdCommand.operationId).not.toBe(secondCommand.operationId)
    expect(onDone.mock.calls.length).toBe(0)

    act(() => {
      resetStateMirrorForTests(
        walletState({
          tokens: {
            byId: {
              [toTokenId(thirdCommand.token)]: {
                ...thirdCommand.token,
                custom: true,
                curated: false,
                sources: ['custom'],
                updatedAt: 3
              }
            },
            accountTokenIds: {}
          }
        })
      )
    })
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
  })

  it('distinguishes editing from adding a token', () => {
    const view = render(
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
    view.unmount()

    render(
      <AddToken
        data={{
          notifyData: { chain: { id: 1 }, address: '0x64aa3364F17a4D01c6f1751Fd97C2BD3D7e7f1D4' }
        }}
      />
    )

    const addHeading = screen.getByTestId('addTokenFormTitle')
    expect(addHeading.textContent).toBe('Add New Token')
  })

  it('should show defaults and prompt to fill in missing token data', () => {
    render(
      <AddToken
        data={{ notifyData: { chain: { id: 137 }, address: '0x64aa3364F17a4D01c6f1751Fd97C2BD3D7e7f1D4' } }}
      />
    )

    const contractAddressInput = screen.getByRole('heading')
    const tokenNameInput = screen.getByLabelText<HTMLInputElement>('Token Name')
    const tokenSymbolInput = screen.getByLabelText<HTMLInputElement>('Symbol')
    const tokenDecimalsInput = screen.getByLabelText<HTMLInputElement>('Decimals')
    const button = screen.getByRole('button')

    expect(contractAddressInput.textContent).toEqual('0x64aa3364D7e7f1D4')
    expect(tokenNameInput.value).toEqual('Token Name')
    expect(tokenSymbolInput.value).toEqual('Symbol')
    expect(tokenDecimalsInput.value).toEqual('?')
    expect(button.textContent).toBe('Fill in Token Details')
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
