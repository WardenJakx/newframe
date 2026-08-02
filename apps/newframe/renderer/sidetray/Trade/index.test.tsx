import { afterEach, beforeEach, describe, expect, it, jest as timers } from 'bun:test'

import type { Mock } from 'bun:test'
import { act } from '@testing-library/react'

import { fireEvent, render, screen, waitFor } from '../../../test/support/componentSetup'
import Trade from './index'
import {
  applyStateMessage,
  beginStateConnection,
  sideTrayRendererStateStoreReadApi,
  resetStateMirrorForTests
} from '../../state/rendererStore'
import { createHostFixture } from '../../../test/support/rendererClient'
import {
  FLASH_ANVIL_CHAIN_ID,
  FLASH_MARKET_ORDER_TYPE,
  FLASH_USDC_ADDRESS,
  FLASH_WETH_ADDRESS
} from '../../../domain/flash/constants'
import { FLASH_USDC_ASSET, FLASH_WETH_ASSET } from '../../../domain/flash/assets'
import type { FlashQuoteDisplay } from '../../../contracts/operations'
import { STATE_STREAM_SCHEMA_VERSION } from '../../../contracts/state/protocol'

const link = createHostFixture()

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

function initializeTradeState(balances = [wethBalance()], customTokens: any[] = []) {
  const tokenRecords = [...balances, ...customTokens].map((token) => ({
    ...token,
    custom: customTokens.includes(token),
    curated: false,
    sources: customTokens.includes(token) ? ['custom'] : ['onchain'],
    updatedAt: 0
  }))
  stateRevision = 0
  resetStateMirrorForTests()
  beginStateConnection('sidetray')
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
      operations: {},
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
            image: {
              base64: 'Y2hhaW4=',
              contentHash: 'chain-image',
              mimeType: 'image/png',
              sourceUrl: 'https://cdn.example/chain.png'
            },
            primaryColor: 'accent1',
            nativeCurrency: {
              symbol: 'ETH',
              name: 'Ether',
              decimals: 18
            }
          }
        }
      },
      assetRates: {
        [`${FLASH_ANVIL_CHAIN_ID}:${FLASH_USDC_ADDRESS}`]: {
          usdRate: 1,
          source: 'zerion',
          observedAt: 1
        }
      },
      runtime: {
        profile: 'dev',
        isDev: true,
        environment: 'test'
      },
      tokens: {
        byId: Object.fromEntries(
          tokenRecords.map((token) => [
            `${token.chainId}:${token.address.toLowerCase()}`,
            { ...token, address: token.address.toLowerCase() }
          ])
        ),
        accountTokenIds: {
          [sender.address]: tokenRecords.map((token) => `${token.chainId}:${token.address.toLowerCase()}`)
        }
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

function quote(id: string, inputAmount: string): FlashQuoteDisplay {
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
    nextAction: 'sign',
    requiresPermit: false,
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
    ]
  }
}

describe('Trade', () => {
  beforeEach(() => {
    timers.useFakeTimers()
    initializeTradeState()
  })

  afterEach(() => {
    timers.useRealTimers()
  })

  it('re-quotes market trades when the selected account changes without clearing the ticket', async () => {
    const quoteCalls: any[] = []

    ;(link.executeQuery as Mock<any>).mockImplementation(async (query: any) => {
      if (query.type === 'flash.quote') {
        quoteCalls.push(query.request)
        return {
          ok: true,
          quoteId: `quote-${quoteCalls.length}`,
          quote: quote(`quote-${quoteCalls.length}`, query.request.qty)
        }
      }

      return { ok: false, error: 'invalid_query' }
    })

    render(<Trade assetId={`${FLASH_ANVIL_CHAIN_ID}:${FLASH_WETH_ADDRESS}`} />)

    fireEvent.change(screen.getByLabelText('WETH amount'), {
      target: { value: '1' }
    })

    await act(async () => {
      timers.advanceTimersByTime(250)
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
      timers.advanceTimersByTime(250)
    })

    expect((screen.getByLabelText('WETH amount') as HTMLInputElement).value).toBe('1')
    expect(quoteCalls).toHaveLength(2)
    expect(quoteCalls[1]).not.toHaveProperty('accountAddress')
  })

  it('pauses quote refresh for projected signing and releases a pending workflow when the ticket changes', async () => {
    const quoteCalls: any[] = []

    ;(link.executeQuery as Mock<any>).mockImplementation(async (query: any) => {
      if (query.type !== 'flash.quote') return { ok: false, error: 'invalid_query' }
      quoteCalls.push(query.request)
      const result = quote(`quote-${quoteCalls.length}`, query.request.qty)
      result.nextAction = 'approve'
      result.actions = {
        approval: {
          id: 'approval',
          kind: 'approve',
          label: 'Approve WETH',
          asset: FLASH_WETH_ASSET,
          amount: query.request.qty,
          amountRaw: '1000000000000000000'
        }
      }
      return {
        ok: true,
        quoteId: `quote-${quoteCalls.length}`,
        quote: result
      }
    })
    ;(link.executeCommand as Mock<any>).mockResolvedValue({ ok: true })

    render(<Trade assetId={`${FLASH_ANVIL_CHAIN_ID}:${FLASH_WETH_ADDRESS}`} />)
    fireEvent.change(screen.getByLabelText('WETH amount'), { target: { value: '1' } })
    await act(async () => timers.advanceTimersByTime(250))
    fireEvent.click(await screen.findByRole('button', { name: 'Approve WETH' }))

    const prepareCommand: any = (link.executeCommand as Mock<any>).mock.calls.find(
      ([command]: any[]) => command.type === 'trade.prepare'
    )?.[0]
    expect(prepareCommand).toEqual({
      type: 'trade.prepare',
      operationId: expect.any(String),
      quoteId: 'quote-1',
      action: 'approve'
    })
    await act(async () => {
      updateTradeState({
        operations: {
          [prepareCommand.operationId]: {
            id: prepareCommand.operationId,
            type: 'trade.execute',
            status: 'pending',
            phase: 'awaiting_submit',
            startedAt: 1,
            updatedAt: 2
          }
        }
      })
    })
    fireEvent.click(screen.getByRole('button', { name: 'Review/sign' }))
    const submitCommand: any = (link.executeCommand as Mock<any>).mock.calls.find(
      ([command]: any[]) => command.type === 'trade.submit'
    )?.[0]
    expect(submitCommand.operationId).toBe(prepareCommand.operationId)
    await act(async () => {
      const mirrored = sideTrayRendererStateStoreReadApi.getState()
      updateTradeState({
        balances: {
          ...mirrored.balances,
          [sender.address]: mirrored.balances[sender.address].map((balance) => ({ ...balance }))
        },
        assetRates: { ...mirrored.assetRates },
        tokens: { ...mirrored.tokens, byId: { ...mirrored.tokens.byId } },
        operations: {
          [submitCommand.operationId]: {
            id: submitCommand.operationId,
            type: 'trade.execute',
            status: 'pending',
            phase: 'signing_order',
            startedAt: 1,
            updatedAt: 2
          }
        }
      })
    })
    await act(async () => timers.advanceTimersByTime(500))

    expect(quoteCalls).toHaveLength(1)
    fireEvent.change(screen.getByLabelText('WETH amount'), { target: { value: '2' } })
    await act(async () => timers.advanceTimersByTime(250))
    expect(link.executeCommand).toHaveBeenCalledWith({ type: 'trade.release' })
    expect(quoteCalls).toHaveLength(2)
    expect(quoteCalls[1].qty).toBe('2')
  })

  it('ignores a stale delayed acknowledgement and unlocks retry after a current rejection', async () => {
    const staleMessage = 'Stale command failed.'
    const currentMessage = 'Trade request was rejected.'
    let resolveFirst!: (value: unknown) => void
    let submitCount = 0

    ;(link.executeQuery as Mock<any>).mockImplementation(async (query: any) => {
      if (query.type !== 'flash.quote') return { ok: false, error: 'invalid_query' }

      const quoteId = `submit-error-${query.request.qty}`
      return { ok: true, quoteId, quote: quote(quoteId, query.request.qty) }
    })
    ;(link.executeCommand as Mock<any>).mockImplementation(async (command: any) => {
      if (command.type === 'trade.submit') {
        submitCount += 1
        if (submitCount === 1) return await new Promise((resolve) => (resolveFirst = resolve))
        return { ok: false, error: 'invalid_command', message: currentMessage }
      }

      return { ok: true }
    })

    render(<Trade assetId={`${FLASH_ANVIL_CHAIN_ID}:${FLASH_WETH_ADDRESS}`} />)
    fireEvent.change(screen.getByLabelText('WETH amount'), { target: { value: '1' } })
    await act(async () => timers.advanceTimersByTime(250))
    fireEvent.click(await screen.findByRole('button', { name: 'Review/sign' }))
    fireEvent.change(screen.getByLabelText('WETH amount'), { target: { value: '2' } })
    await act(async () => timers.advanceTimersByTime(250))
    resolveFirst({ ok: false, error: 'invalid_command', message: staleMessage })
    await act(async () => await Promise.resolve())
    expect(screen.queryByText(staleMessage)).toBe(null)

    fireEvent.click(await screen.findByRole('button', { name: 'Review/sign' }))
    expect(await screen.findByText(currentMessage)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Review/sign' })).toBeTruthy()
    expect(link.executeCommand).not.toHaveBeenCalledWith({ type: 'sidetray.close' })
  })

  it('keeps a projected failure visible and allows retry with a new operation', async () => {
    ;(link.executeQuery as Mock<any>).mockImplementation(async (query: any) => {
      if (query.type !== 'flash.quote') return { ok: false, error: 'invalid_query' }

      return {
        ok: true,
        quoteId: 'failed-trade-quote',
        quote: quote('failed-trade-quote', query.request.qty)
      }
    })
    ;(link.executeCommand as Mock<any>).mockResolvedValue({ ok: true })

    render(<Trade assetId={`${FLASH_ANVIL_CHAIN_ID}:${FLASH_WETH_ADDRESS}`} />)
    fireEvent.change(screen.getByLabelText('WETH amount'), { target: { value: '1' } })
    await act(async () => timers.advanceTimersByTime(250))
    fireEvent.click(await screen.findByRole('button', { name: 'Review/sign' }))
    const firstCommand: any = (link.executeCommand as Mock<any>).mock.calls.find(
      ([command]: any[]) => command.type === 'trade.submit'
    )?.[0]

    await act(async () => {
      updateTradeState({
        operations: {
          [firstCommand.operationId]: {
            id: firstCommand.operationId,
            type: 'trade.execute',
            status: 'failed',
            phase: 'signing_order_failed',
            error: { code: 'sign_failed', message: 'Order signature was rejected.' },
            startedAt: 1,
            updatedAt: 2,
            finishedAt: 2
          }
        }
      })
    })

    expect(await screen.findByText('Order signature was rejected.')).toBeTruthy()
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Review/sign' }).disabled).toBe(false)
    expect(link.executeCommand).not.toHaveBeenCalledWith({ type: 'sidetray.close' })

    fireEvent.click(screen.getByRole('button', { name: 'Review/sign' }))
    const submitCommands = (link.executeCommand as Mock<any>).mock.calls
      .map(([command]: any[]) => command)
      .filter((command: any) => command.type === 'trade.submit')
    expect(submitCommands).toHaveLength(2)
    expect(submitCommands[1].operationId).not.toBe(firstCommand.operationId)
  })

  it('refreshes unchanged quotes after fifteen seconds and request changes after the debounce', async () => {
    const quoteCalls: any[] = []

    ;(link.executeQuery as Mock<any>).mockImplementation(async (query: any) => {
      if (query.type !== 'flash.quote') return { ok: false, error: 'invalid_query' }
      quoteCalls.push(query.request)
      return {
        ok: true,
        quoteId: `quote-${quoteCalls.length}`,
        quote: quote(`quote-${quoteCalls.length}`, query.request.qty)
      }
    })

    render(<Trade assetId={`${FLASH_ANVIL_CHAIN_ID}:${FLASH_WETH_ADDRESS}`} />)
    fireEvent.change(screen.getByLabelText('WETH amount'), { target: { value: '1' } })
    await act(async () => timers.advanceTimersByTime(250))

    expect(quoteCalls).toHaveLength(1)

    await act(async () => {
      const mirrored = sideTrayRendererStateStoreReadApi.getState()
      updateTradeState({
        balances: {
          ...mirrored.balances,
          [sender.address]: mirrored.balances[sender.address].map((balance) => ({ ...balance }))
        },
        assetRates: { ...mirrored.assetRates }
      })
    })
    await act(async () => timers.advanceTimersByTime(500))
    expect(quoteCalls).toHaveLength(1)

    await act(async () => timers.advanceTimersByTime(14_499))
    expect(quoteCalls).toHaveLength(1)

    await act(async () => timers.advanceTimersByTime(1))
    expect(quoteCalls).toHaveLength(2)

    fireEvent.change(screen.getByLabelText('WETH amount'), { target: { value: '2' } })
    await act(async () => timers.advanceTimersByTime(249))
    expect(quoteCalls).toHaveLength(2)

    await act(async () => timers.advanceTimersByTime(1))
    expect(quoteCalls).toHaveLength(3)
    expect(quoteCalls[2].qty).toBe('2')
  })

  it('maps the balance percentage slider to the spent asset amount', () => {
    render(<Trade assetId={`${FLASH_ANVIL_CHAIN_ID}:${FLASH_WETH_ADDRESS}`} />)

    const slider = screen.getByLabelText('WETH amount percentage') as HTMLInputElement
    const percent = screen.getByLabelText('WETH balance percentage') as HTMLInputElement
    const amount = screen.getByLabelText('WETH amount') as HTMLInputElement

    expect(slider.min).toBe('0')
    expect(slider.max).toBe('100')
    expect(slider.getAttribute('data-tone')).toBe('danger')
    fireEvent.change(slider, { target: { value: '50' } })

    expect(amount.value).toBe('0.5')
    expect(percent.value).toBe('50')

    fireEvent.change(percent, { target: { value: '100' } })
    expect(amount.value).toBe('1')
    expect(slider.value).toBe('100')

    fireEvent.click(screen.getByRole('button', { name: 'Switch to BUY' }))
    const buySlider = screen.getByLabelText('USDC amount percentage')
    expect(buySlider.getAttribute('data-tone')).toBe('special')
  })

  it('derives permit, order, submit, and close progress only from projected canonical state', async () => {
    const permitQuote = quote('permit-quote', '1')
    permitQuote.requiresPermit = true
    ;(link.executeQuery as Mock<any>).mockImplementation(async (query: any) => {
      if (query.type === 'flash.quote') {
        return { ok: true, quoteId: permitQuote.id, quote: permitQuote }
      }

      return { ok: false, error: 'invalid_query' }
    })
    ;(link.executeCommand as Mock<any>).mockResolvedValue({ ok: true })

    render(<Trade assetId={`${FLASH_ANVIL_CHAIN_ID}:${FLASH_WETH_ADDRESS}`} />)
    fireEvent.change(screen.getByLabelText('WETH amount'), { target: { value: '1' } })
    await act(async () => timers.advanceTimersByTime(250))

    fireEvent.click(await screen.findByRole('button', { name: 'Review/sign' }))
    const command: any = (link.executeCommand as Mock<any>).mock.calls.find(
      ([input]: any[]) => input.type === 'trade.submit'
    )?.[0]
    expect(command).toEqual({
      type: 'trade.submit',
      operationId: expect.any(String),
      quoteId: 'permit-quote'
    })
    expect(JSON.stringify(command)).not.toMatch(/signature|typedData|payload|transaction|calldata/i)

    const projectOperation = async (phase: string, status: 'pending' | 'succeeded' = 'pending') => {
      await act(async () => {
        updateTradeState({
          operations: {
            [command.operationId]: {
              id: command.operationId,
              type: 'trade.execute',
              status,
              phase,
              entityRefs: status === 'succeeded' ? [{ type: 'order', id: 'permit-order' }] : [],
              startedAt: 1,
              updatedAt: 2,
              ...(status === 'succeeded' ? { finishedAt: 2 } : {})
            }
          }
        })
      })
    }

    await projectOperation('signing_permit')
    expect(screen.getByText('Review permit in Newframe')).toBeTruthy()
    await projectOperation('signing_order')
    expect(screen.getByText('Review order in Newframe')).toBeTruthy()
    await projectOperation('submitting')
    expect(screen.getByText('Submitting order')).toBeTruthy()
    await projectOperation('submitted', 'succeeded')
    expect(link.executeCommand).not.toHaveBeenCalledWith({ type: 'sidetray.close' })

    await act(async () => {
      updateTradeState({
        orders: {
          'permit-order': {
            orderId: 'permit-order',
            accountAddress: sender.address,
            chainId: FLASH_ANVIL_CHAIN_ID,
            provider: 'flash',
            status: 'open',
            orderType: 'market',
            side: 'sell',
            targetAsset: FLASH_WETH_ASSET,
            contraAsset: FLASH_USDC_ASSET,
            qty: '1',
            spentAmount: '1',
            outputAmount: '2400',
            estimatedOutputAmount: '2400',
            filledOutputAmount: '0',
            averageFillPrice: null,
            createdAt: 1,
            updatedAt: 2,
            terminalAt: null,
            open: true,
            cancellable: true
          }
        }
      })
    })
    await waitFor(() => expect(link.executeCommand).toHaveBeenCalledWith({ type: 'sidetray.close' }))
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
    fireEvent.click(screen.getByRole('button', { name: 'Advanced' }))
    expect((screen.getByLabelText('Slippage') as HTMLInputElement).placeholder).toBe('Automatic')

    fireEvent.click(screen.getByRole('tab', { name: 'Limit' }))
    const limitPrice = screen.getByLabelText('Limit price') as HTMLInputElement
    expect(limitPrice.required).toBe(true)
    expect(limitPrice.labels?.[0]?.textContent).toContain('*')

    fireEvent.click(screen.getByRole('tab', { name: 'TWAP' }))
    expect(screen.getByLabelText('TWAP duration hours')).toBeTruthy()
    const twapStart = screen.getByLabelText('TWAP start time') as HTMLInputElement
    expect(twapStart.required).toBe(false)
    expect(twapStart.type).toBe('datetime-local')
    fireEvent.click(screen.getByRole('button', { name: 'Advanced' }))
    expect((screen.getByLabelText('TWAP segments') as HTMLInputElement).placeholder).toBe('Automatic')

    fireEvent.click(screen.getByRole('tab', { name: 'TP/SL' }))
    expect(screen.getByRole('button', { name: 'Take profit' })).toBeTruthy()
    expect((screen.getByLabelText('Take-profit trigger price') as HTMLInputElement).required).toBe(true)
    expect((screen.getByLabelText('Take-profit limit price') as HTMLInputElement).required).toBe(false)

    fireEvent.click(screen.getByRole('tab', { name: 'Stop' }))
    expect((screen.getByLabelText('Stop trigger price') as HTMLInputElement).required).toBe(true)
    expect(screen.getByLabelText('USDC amount')).toBeTruthy()
  })

  it('stays mounted when a newly created account is selected before balances exist', async () => {
    render(<Trade assetId={`${FLASH_ANVIL_CHAIN_ID}:${FLASH_WETH_ADDRESS}`} />)

    await act(async () => {
      const state = sideTrayRendererStateStoreReadApi.getState()
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
})
