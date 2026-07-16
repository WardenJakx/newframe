import type { Mock } from 'bun:test'
import { act } from '@testing-library/react'

import { fireEvent, render, screen, waitFor } from '../../../componentSetup'
import Trade from '../../../../app/sidetray/Trade'
import {
  applyStateMessage,
  beginStateConnection,
  dappRendererStateStoreReadApi,
  resetStateMirrorForTests
} from '../../../../app/state/rendererStore'
import link from '../../../../resources/link'
import {
  FLASH_ANVIL_CHAIN_ID,
  FLASH_MARKET_ORDER_TYPE,
  FLASH_USDC_ADDRESS,
  FLASH_WETH_ADDRESS
} from '../../../../resources/domain/flash/constants'
import { FLASH_USDC_ASSET, FLASH_WETH_ASSET } from '../../../../resources/domain/flash/assets'
import { type FlashQuote } from '../../../../resources/domain/flash/schemas'
import { STATE_STREAM_SCHEMA_VERSION } from '../../../../resources/state/protocol'

const sender = {
  id: 'sender',
  address: '0x0000000000000000000000000000000000000001',
  name: 'Sender',
  lastSignerType: 'address'
}
const other = {
  id: 'other',
  address: '0x0000000000000000000000000000000000000002',
  name: 'Other',
  lastSignerType: 'address'
}
const newAccount = {
  id: 'new-account',
  address: '0x0000000000000000000000000000000000000003',
  name: 'New Account',
  lastSignerType: 'address'
}

let stateRevision = 0

function updateTradeState(changes: Record<string, unknown>) {
  const baseRevision = stateRevision
  stateRevision += 1

  return applyStateMessage({
    schemaVersion: STATE_STREAM_SCHEMA_VERSION,
    streamId: 'trade-test',
    baseRevision,
    revision: stateRevision,
    changes
  })
}

function initializeTradeState(balances = [wethBalance()]) {
  stateRevision = 0
  resetStateMirrorForTests()
  beginStateConnection('dapp')
  applyStateMessage({
    schemaVersion: STATE_STREAM_SCHEMA_VERSION,
    streamId: 'trade-test',
    revision: 0,
    state: {
      currentAccount: sender.id,
      accounts: {
        [sender.id]: sender,
        [other.id]: other
      },
      accountOrder: [sender.id, other.id],
      balances: {
        [sender.address]: balances,
        [other.address]: [wethBalance()]
      },
      networks: {
        ethereum: {
          [FLASH_ANVIL_CHAIN_ID]: {
            id: FLASH_ANVIL_CHAIN_ID,
            explorer: '',
            isTestnet: true,
            name: 'Local',
            on: true
          }
        }
      },
      networksMeta: {
        ethereum: {
          [FLASH_ANVIL_CHAIN_ID]: {
            primaryColor: 'accent1',
            nativeCurrency: {
              symbol: 'ETH',
              name: 'Ether',
              decimals: 18,
              usd: { price: 1000, change24hr: 0 }
            }
          }
        }
      },
      rates: {
        [FLASH_USDC_ADDRESS]: {
          usd: { price: 1, change24hr: 0 }
        }
      },
      runtime: {
        profile: 'dev',
        isDev: true,
        environment: 'test'
      }
    }
  })
}

function wethBalance() {
  return {
    address: FLASH_WETH_ADDRESS,
    balance: '1000000000000000000',
    chainId: FLASH_ANVIL_CHAIN_ID,
    decimals: 18,
    displayBalance: '',
    name: 'Wrapped Ether',
    symbol: 'WETH'
  }
}

function usdcBalance() {
  return {
    address: FLASH_USDC_ADDRESS,
    balance: '1000000000000',
    chainId: FLASH_ANVIL_CHAIN_ID,
    decimals: 6,
    displayBalance: '',
    name: 'USD Coin',
    symbol: 'USDC'
  }
}

function tokenBalance(index: number) {
  return {
    address: `0x${(index + 100).toString(16).padStart(40, '0')}`,
    balance: '1',
    chainId: FLASH_ANVIL_CHAIN_ID,
    decimals: 18,
    displayBalance: '',
    name: `Token ${index}`,
    symbol: `T${index}`
  }
}

function quote(id: string, inputAmount: string): FlashQuote {
  return {
    id,
    side: 'sell',
    orderType: FLASH_MARKET_ORDER_TYPE,
    targetAsset: FLASH_WETH_ASSET,
    contraAsset: FLASH_USDC_ASSET,
    spentAsset: FLASH_WETH_ASSET,
    receiveAsset: FLASH_USDC_ASSET,
    inputAmount,
    outputAmount: '2400',
    inputNotional: '2400',
    outputNotional: '2390',
    estimatedFeeNotional: '1.25',
    targetNotionalPrice: '2400',
    rate: '1 WETH = 2400 USDC',
    fees: [],
    steps: [
      { id: 'approve', kind: 'approve', label: 'Approve WETH', status: 'required' },
      { id: 'sign', kind: 'sign', label: 'Sign order', status: 'required' },
      { id: 'submit', kind: 'submit', label: 'Submit order', status: 'required' }
    ],
    raw: {
      orderTypedData: {
        domain: { chainId: FLASH_ANVIL_CHAIN_ID },
        message: { id },
        primaryType: 'Order',
        types: { Order: [] }
      }
    }
  }
}

describe('Trade', () => {
  beforeEach(() => {
    initializeTradeState()
  })

  it('initializes generic Trade with the preferred contra before the target asset', () => {
    initializeTradeState([usdcBalance(), { ...wethBalance(), balance: '10000000000000000000' }])

    render(<Trade chainId={FLASH_ANVIL_CHAIN_ID} />)

    expect(screen.getByLabelText('Select target asset').textContent).toContain('WETH')
    expect(screen.getByLabelText('Select contra asset').textContent).toContain('USDC')
    expect((screen.getByLabelText('WETH amount') as HTMLInputElement).readOnly).toBe(false)
    expect(screen.getByRole('button', { name: 'Switch to BUY' })).toBeTruthy()
  })

  it('re-quotes market trades when the selected account changes without clearing the ticket', async () => {
    const quoteCalls: any[] = []

    ;(link.executeQuery as Mock<any>).mockImplementation(async (query: any) => {
      if (query.type === 'flash.quote') {
        quoteCalls.push(query.request)
        return {
          ok: true,
          quote: quote(`quote-${quoteCalls.length}`, query.request.qty),
          flash: { quoteId: `quote-${quoteCalls.length}` }
        }
      }

      return { ok: false, error: 'invalid_query' }
    })

    render(<Trade assetId={`${FLASH_ANVIL_CHAIN_ID}:${FLASH_WETH_ADDRESS}`} />)

    fireEvent.change(screen.getByLabelText('WETH amount'), {
      target: { value: '1' }
    })

    await act(async () => {
      jest.advanceTimersByTime(250)
    })

    expect(await screen.findByText('Est. output')).toBeTruthy()
    expect(screen.getByText('2400 USDC')).toBeTruthy()
    expect(screen.getAllByText('~$2,390.00')).toHaveLength(2)
    expect(screen.getByText('Est. price impact')).toBeTruthy()
    expect(screen.getByText('0.42%')).toBeTruthy()
    expect(screen.queryByText('+0.42%')).toBe(null)
    expect(screen.getByText('Sign order')).toBeTruthy()
    expect(quoteCalls).toHaveLength(1)
    expect(quoteCalls[0]).not.toHaveProperty('accountAddress')
    expect(quoteCalls[0]).not.toHaveProperty('targetChain')
    expect(quoteCalls[0]).not.toHaveProperty('contraChain')

    await act(async () => {
      updateTradeState({ currentAccount: other.id })
    })
    await act(async () => {
      jest.advanceTimersByTime(250)
    })

    expect((screen.getByLabelText('WETH amount') as HTMLInputElement).value).toBe('1')
    expect(quoteCalls).toHaveLength(2)
    expect(quoteCalls[1]).not.toHaveProperty('accountAddress')
  })

  it('does not re-quote when synchronized balances are semantically unchanged during signing', async () => {
    const quoteCalls: any[] = []
    const submitCommands: any[] = []
    let resolveSignature!: (value: any) => void
    const signatureResult = new Promise((resolve) => {
      resolveSignature = resolve
    })

    ;(link.executeQuery as Mock<any>).mockImplementation(async (query: any) => {
      if (query.type !== 'flash.quote') return { ok: false, error: 'invalid_query' }
      quoteCalls.push(query.request)
      return {
        ok: true,
        quote: quote(`quote-${quoteCalls.length}`, query.request.qty),
        flash: { quoteId: `quote-${quoteCalls.length}` }
      }
    })
    ;(link.executeCommand as Mock<any>).mockImplementation(async (command: any) => {
      if (command.type === 'typedData.signV4') return signatureResult
      if (command.type === 'flash.submit') {
        submitCommands.push(command)
        return { ok: true, orderId: 'order-1' }
      }
      return { ok: true }
    })

    render(<Trade assetId={`${FLASH_ANVIL_CHAIN_ID}:${FLASH_WETH_ADDRESS}`} />)
    fireEvent.change(screen.getByLabelText('WETH amount'), { target: { value: '1' } })
    await act(async () => jest.advanceTimersByTime(250))
    fireEvent.click(await screen.findByRole('button', { name: 'Review/sign' }))

    await waitFor(() =>
      expect(link.executeCommand).toHaveBeenCalledWith(expect.objectContaining({ type: 'typedData.signV4' }))
    )
    await act(async () => {
      const mirrored = dappRendererStateStoreReadApi.getState()
      updateTradeState({
        balances: {
          ...mirrored.balances,
          [sender.address]: mirrored.balances[sender.address].map((balance) => ({ ...balance }))
        },
        rates: { ...mirrored.rates }
      })
      jest.advanceTimersByTime(500)
    })

    expect(quoteCalls).toHaveLength(1)
    resolveSignature({ ok: true, signature: `0x${'1'.repeat(130)}` })
    await waitFor(() => expect(submitCommands).toHaveLength(1))
  })

  it('preserves the entered amount when Flash normalizes the quote input', async () => {
    const quoteCalls: any[] = []

    ;(link.executeQuery as Mock<any>).mockImplementation(async (query: any) => {
      if (query.type !== 'flash.quote') return { ok: false, error: 'invalid_query' }
      quoteCalls.push(query.request)
      return { ok: true, quote: quote('normalized-quote', '1'), flash: {} }
    })

    render(<Trade assetId={`${FLASH_ANVIL_CHAIN_ID}:${FLASH_WETH_ADDRESS}`} />)
    fireEvent.change(screen.getByLabelText('WETH amount'), { target: { value: '1.0' } })
    await act(async () => jest.advanceTimersByTime(250))
    await screen.findByRole('button', { name: 'Review/sign' })
    await act(async () => jest.advanceTimersByTime(500))

    expect((screen.getByLabelText('WETH amount') as HTMLInputElement).value).toBe('1.0')
    expect(quoteCalls).toHaveLength(1)
  })

  it('maps the balance percentage slider to the spent asset amount', () => {
    render(<Trade assetId={`${FLASH_ANVIL_CHAIN_ID}:${FLASH_WETH_ADDRESS}`} />)

    const slider = screen.getByLabelText('WETH amount percentage') as HTMLInputElement
    const percent = screen.getByLabelText('WETH balance percentage') as HTMLInputElement
    const amount = screen.getByLabelText('WETH amount') as HTMLInputElement

    expect(slider.min).toBe('0')
    expect(slider.max).toBe('100')
    expect(slider.getAttribute('data-direction')).toBe('sell')
    fireEvent.change(slider, { target: { value: '50' } })

    expect(amount.value).toBe('0.5')
    expect(percent.value).toBe('50')

    fireEvent.change(percent, { target: { value: '100' } })
    expect(amount.value).toBe('1')
    expect(slider.value).toBe('100')

    fireEvent.click(screen.getByRole('button', { name: 'Switch to BUY' }))
    const buySlider = screen.getByLabelText('USDC amount percentage')
    expect(buySlider.getAttribute('data-direction')).toBe('buy')
  })

  it('signs a quoted permit before the order and echoes both typed-data payloads', async () => {
    const signCommands: any[] = []
    let submitPayload: any = null
    const orderTypedData = {
      domain: { chainId: FLASH_ANVIL_CHAIN_ID },
      message: { quoteId: 'permit-quote' },
      primaryType: 'Order',
      types: { Order: [] }
    }
    const permitTypedData = {
      domain: { chainId: FLASH_ANVIL_CHAIN_ID },
      message: { permitted: true },
      primaryType: 'Permit',
      types: { Permit: [] }
    }
    const orderTypedDataRaw = ` ${JSON.stringify(orderTypedData)} `
    const permitTypedDataRaw = `\n${JSON.stringify(permitTypedData)}\n`
    const permitQuote = quote('permit-quote', '1')
    permitQuote.raw = {
      evm: {
        orderTypedData,
        orderTypedDataRaw,
        permitTypedData,
        permitTypedDataRaw
      }
    }
    ;(link.executeQuery as Mock<any>).mockImplementation(async (query: any) => {
      if (query.type === 'flash.quote') {
        return { ok: true, quote: permitQuote, flash: permitQuote.raw }
      }

      return { ok: false, error: 'invalid_query' }
    })
    ;(link.executeCommand as Mock<any>).mockImplementation(async (command: any) => {
      if (command.type === 'typedData.signV4') {
        signCommands.push(command)
        return {
          ok: true,
          signature: signCommands.length === 1 ? `0x${'1'.repeat(130)}` : `0x${'2'.repeat(130)}`
        }
      }
      if (command.type === 'flash.submit') {
        submitPayload = command.order
        return { ok: true, orderId: 'permit-order' }
      }

      return { ok: true }
    })

    render(<Trade assetId={`${FLASH_ANVIL_CHAIN_ID}:${FLASH_WETH_ADDRESS}`} />)
    fireEvent.change(screen.getByLabelText('WETH amount'), { target: { value: '1' } })
    await act(async () => jest.advanceTimersByTime(250))

    fireEvent.click(await screen.findByRole('button', { name: 'Review/sign' }))
    await act(async () => {
      for (let index = 0; index < 20; index += 1) await Promise.resolve()
    })

    expect(signCommands).toHaveLength(2)
    await waitFor(() => expect(submitPayload).toBeTruthy())
    expect(signCommands[0]).toMatchObject({
      type: 'typedData.signV4',
      chainId: FLASH_ANVIL_CHAIN_ID,
      typedData: { primaryType: 'Permit' }
    })
    expect(signCommands[1]).toMatchObject({
      type: 'typedData.signV4',
      chainId: FLASH_ANVIL_CHAIN_ID,
      typedData: { primaryType: 'Order' }
    })
    expect(submitPayload).toMatchObject({
      evmOrderTypedData: orderTypedDataRaw,
      evmPermitSignature: `0x${'1'.repeat(130)}`,
      evmPermitTypedData: permitTypedDataRaw,
      signature: `0x${'2'.repeat(130)}`
    })
    expect(submitPayload).not.toHaveProperty('accountAddress')
    expect(submitPayload).not.toHaveProperty('targetChain')
    expect(submitPayload).not.toHaveProperty('contraChain')
    expect(submitPayload.quote.id).toBe('permit-quote')
  })

  it('exposes the new order tabs and progressive advanced fields', () => {
    render(<Trade assetId={`${FLASH_ANVIL_CHAIN_ID}:${FLASH_WETH_ADDRESS}`} />)

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Market',
      'Limit',
      'TWAP',
      'TP/SL',
      'Stop'
    ])
    expect(screen.queryByLabelText('Slippage')).toBe(null)
    fireEvent.click(screen.getByRole('button', { name: 'Advanced' }))
    const slippage = screen.getByLabelText('Slippage') as HTMLInputElement
    expect(slippage.value).toBe('')
    expect(slippage.placeholder).toBe('Automatic')

    fireEvent.click(screen.getByRole('tab', { name: 'Limit' }))
    const limitPrice = screen.getByLabelText('Limit price') as HTMLInputElement
    expect(limitPrice.required).toBe(true)
    expect(screen.getByText('*', { selector: '.tradeRequiredMark' })).toBeTruthy()
    expect(screen.queryByLabelText('Limit order type')).toBe(null)
    fireEvent.click(screen.getByRole('button', { name: 'Advanced' }))
    expect((screen.getByLabelText('Time in force') as HTMLSelectElement).value).toBe('gtc')

    fireEvent.click(screen.getByRole('tab', { name: 'TWAP' }))
    expect(screen.getByLabelText('TWAP duration days')).toBeTruthy()
    expect(screen.getByLabelText('TWAP duration hours')).toBeTruthy()
    expect(screen.getByLabelText('TWAP duration minutes')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Advanced' }))
    const segments = screen.getByLabelText('TWAP segments') as HTMLInputElement
    const maxPriceImpact = screen.getByLabelText('Maximum price impact') as HTMLInputElement
    expect(segments.value).toBe('')
    expect(segments.placeholder).toBe('Automatic')
    expect(maxPriceImpact.value).toBe('')
    expect(maxPriceImpact.placeholder).toBe('Automatic')

    fireEvent.click(screen.getByRole('tab', { name: 'TP/SL' }))
    expect(screen.getByRole('button', { name: 'Take profit' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Stop loss' })).toBeTruthy()
    expect((screen.getByLabelText('Take-profit trigger price') as HTMLInputElement).required).toBe(true)
    expect((screen.getByLabelText('Take-profit limit price') as HTMLInputElement).required).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Stop loss' }))
    expect((screen.getByLabelText('Stop-loss trigger price') as HTMLInputElement).required).toBe(true)
    expect((screen.getByLabelText('Stop-loss limit price') as HTMLInputElement).required).toBe(false)

    fireEvent.click(screen.getByRole('tab', { name: 'Stop' }))
    expect((screen.getByLabelText('Stop trigger price') as HTMLInputElement).required).toBe(true)
    expect((screen.getByLabelText('Stop limit price') as HTMLInputElement).required).toBe(false)
    expect(screen.getByLabelText('USDC amount')).toBeTruthy()
  })

  it('marks missing required order fields without marking optional limit prices', () => {
    render(<Trade assetId={`${FLASH_ANVIL_CHAIN_ID}:${FLASH_WETH_ADDRESS}`} />)

    fireEvent.click(screen.getByRole('tab', { name: 'TP/SL' }))
    fireEvent.change(screen.getByLabelText('WETH amount'), { target: { value: '0.1' } })

    const trigger = screen.getByLabelText('Take-profit trigger price') as HTMLInputElement
    const limit = screen.getByLabelText('Take-profit limit price') as HTMLInputElement

    expect(screen.getByText('Enter a trigger price.')).toBeTruthy()
    expect(trigger.getAttribute('aria-invalid')).toBe('true')
    expect(limit.getAttribute('aria-invalid')).toBe(null)
    expect(screen.getAllByText('*', { selector: '.tradeRequiredMark' })).toHaveLength(1)
  })

  it('stays mounted when a newly created account is selected before balances exist', async () => {
    render(<Trade assetId={`${FLASH_ANVIL_CHAIN_ID}:${FLASH_WETH_ADDRESS}`} />)

    await act(async () => {
      const state = dappRendererStateStoreReadApi.getState()
      updateTradeState({
        accounts: {
          ...state.accounts,
          [newAccount.id]: newAccount
        },
        accountOrder: [sender.id, other.id, newAccount.id],
        currentAccount: newAccount.id
      })
    })

    expect(screen.getByText('Trade')).toBeTruthy()
    expect(screen.getByLabelText('Close Trade')).toBeTruthy()
  })

  it('paginates large asset menus instead of rendering the full portfolio', () => {
    initializeTradeState([wethBalance(), ...Array.from({ length: 120 }, (_, index) => tokenBalance(index))])

    render(<Trade assetId={`${FLASH_ANVIL_CHAIN_ID}:${FLASH_WETH_ADDRESS}`} />)

    fireEvent.click(screen.getByLabelText('Select target asset'))

    expect(screen.getAllByRole('option')).toHaveLength(50)
    fireEvent.click(screen.getByText('Show 50 more assets'))
    expect(screen.getAllByRole('option')).toHaveLength(100)
  })
})
