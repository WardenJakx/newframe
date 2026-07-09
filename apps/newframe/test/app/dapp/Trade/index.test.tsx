import type { Mock } from 'bun:test'
import { act } from '@testing-library/react'
import Restore from 'react-restore'

import { fireEvent, render, screen } from '../../../componentSetup'
import Trade from '../../../../app/dapp/Trade'
import { applyRestoreActionBatch, initializeRendererStateStore } from '../../../../app/state/rendererStore'
import store from '../../../../main/store'
import link from '../../../../resources/link'
import {
  FLASH_ANVIL_CHAIN_ID,
  FLASH_MARKET_ORDER_TYPE,
  FLASH_USDC_ADDRESS,
  FLASH_USDC_ASSET,
  FLASH_WETH_ADDRESS,
  FLASH_WETH_ASSET,
  type FlashQuote
} from '../../../../resources/domain/flash'

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

function initializeTradeState() {
  initializeRendererStateStore({
    selected: {
      current: sender.id
    },
    main: {
      accounts: {
        [sender.id]: sender,
        [other.id]: other
      },
      accountOrder: [sender.id, other.id],
      balances: {
        [sender.address]: [wethBalance()],
        [other.address]: [wethBalance()]
      },
      networks: {
        ethereum: {
          [FLASH_ANVIL_CHAIN_ID]: {
            id: FLASH_ANVIL_CHAIN_ID,
            name: 'Local',
            on: true
          }
        }
      },
      networksMeta: {
        ethereum: {
          [FLASH_ANVIL_CHAIN_ID]: {
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

function initializeNativeChromeState() {
  ;(window as any).frameId = 'dappLauncher'
  store.set('platform', 'darwin')
  store.set('main.frames', (window as any).frameId, {
    fullscreen: false,
    maximized: false
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
    rate: '1 WETH = 2400 USDC',
    fees: [],
    steps: [
      { id: 'approve', kind: 'approve', label: 'Approve WETH', status: 'required' },
      { id: 'sign', kind: 'sign', label: 'Sign quote', status: 'required' },
      { id: 'submit', kind: 'submit', label: 'Submit trade', status: 'required' }
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
  beforeAll(() => {
    Restore.connect(() => null, store)
  })

  beforeEach(() => {
    initializeTradeState()
    initializeNativeChromeState()
  })

  it('re-quotes market trades when the selected account changes without clearing the ticket', async () => {
    const quoteCalls: any[] = []

    ;(link.rpc as Mock<any>).mockImplementation((method: string, payload: any, callback: any) => {
      if (method === 'flashQuote') {
        quoteCalls.push(payload)
        callback(null, {
          quote: quote(`quote-${quoteCalls.length}`, payload.qty),
          flash: { quoteId: `quote-${quoteCalls.length}` }
        })
      }
    })

    render(<Trade assetId={`${FLASH_ANVIL_CHAIN_ID}:${FLASH_WETH_ADDRESS}`} />)

    fireEvent.change(screen.getByLabelText('WETH amount'), {
      target: { value: '1' }
    })

    await act(async () => {
      jest.advanceTimersByTime(250)
    })

    expect(await screen.findByText('1 WETH = 2400 USDC')).toBeTruthy()
    expect(quoteCalls).toHaveLength(1)
    expect(quoteCalls[0].accountAddress).toBe(sender.address)

    await act(async () => {
      applyRestoreActionBatch([
        {
          updates: [{ path: 'selected.current', value: other.id }]
        }
      ])
    })
    await act(async () => {
      jest.advanceTimersByTime(250)
    })

    expect((screen.getByLabelText('WETH amount') as HTMLInputElement).value).toBe('1')
    expect(quoteCalls).toHaveLength(2)
    expect(quoteCalls[1].accountAddress).toBe(other.address)
  })
})
