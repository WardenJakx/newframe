import type { Mock } from 'bun:test'
import Restore from 'react-restore'

import { fireEvent, render, screen } from '../../../componentSetup'
import Send from '../../../../app/dapp/Send'
import { frameOriginId } from '../../../../app/dapp/Send/sendTransaction'
import { initializeRendererStateStore } from '../../../../app/state/rendererStore'
import store from '../../../../main/store'
import { NATIVE_CURRENCY } from '../../../../resources/constants'
import link from '../../../../resources/link'

const sender = {
  id: 'sender',
  address: '0x0000000000000000000000000000000000000001',
  name: 'Sender',
  lastSignerType: 'address'
}
const recipient = {
  id: 'recipient',
  address: '0x0000000000000000000000000000000000000002',
  name: 'Recipient',
  lastSignerType: 'ledger'
}
const chainId = 31337
const tokenAddress = '0x00000000000000000000000000000000000000bb'
const nativeAssetId = `${chainId}:${NATIVE_CURRENCY}`

function initializeSendState(balances: any[] = [nativeBalance()]) {
  initializeRendererStateStore({
    selected: {
      current: sender.id
    },
    main: {
      accounts: {
        [sender.id]: sender,
        [recipient.id]: recipient
      },
      accountOrder: [recipient.id, sender.id],
      balances: {
        [sender.address]: balances
      },
      networks: {
        ethereum: {
          [chainId]: {
            id: chainId,
            name: 'Local',
            on: true
          }
        }
      },
      networksMeta: {
        ethereum: {
          [chainId]: {
            nativeCurrency: {
              symbol: 'ETH',
              name: 'Ether',
              decimals: 18,
              usd: { price: 1000, change24hr: 0 }
            },
            primaryColor: 'accent1'
          }
        }
      },
      rates: {
        [tokenAddress]: {
          usd: { price: 2, change24hr: 0 }
        }
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

function nativeBalance() {
  return {
    address: NATIVE_CURRENCY,
    balance: '0xde0b6b3a7640000',
    chainId,
    decimals: 18,
    displayBalance: '',
    name: 'Ether',
    symbol: 'ETH'
  }
}

function tokenBalance() {
  return {
    address: tokenAddress,
    balance: '2000000',
    chainId,
    decimals: 6,
    displayBalance: '',
    name: 'USD Coin',
    symbol: 'USDC'
  }
}

describe('Send', () => {
  beforeAll(() => {
    Restore.connect(() => null, store)
  })

  beforeEach(() => {
    initializeSendState()
    initializeNativeChromeState()
  })

  it('renders an empty state when there are no sendable assets', () => {
    initializeSendState([])

    render(<Send />)

    expect(screen.getByText('No assets available to send.')).toBeTruthy()
  })

  it('falls back when the route asset is not sendable', () => {
    render(<Send assetId={`${chainId}:${tokenAddress}`} />)

    expect(screen.getByText('ETH')).toBeTruthy()
  })

  it('prefers the route asset when it is sendable', () => {
    initializeSendState([nativeBalance(), tokenBalance()])

    render(<Send assetId={`${chainId}:${tokenAddress}`} />)

    expect(screen.getByText('USDC')).toBeTruthy()
  })

  it('does not show the sending wallet as a recipient option', () => {
    render(<Send assetId={nativeAssetId} />)

    expect(screen.getByText('Recipient')).toBeTruthy()
    expect(screen.queryByText('Sender')).toBeNull()
    expect(screen.queryByText(sender.address)).toBeNull()
  })

  it('submits a native transfer through the Send service flow', async () => {
    ;(link.rpc as Mock<any>).mockImplementation((method: string, _payload: any, callback: any) => {
      if (method === 'providerSend') callback({})
    })

    const { user } = render(<Send assetId={nativeAssetId} />)
    const recipientButton = screen.getByText('Recipient').closest('button') as HTMLButtonElement

    await user.click(recipientButton)

    const proceedButton = screen.getByRole('button', { name: 'Proceed' })
    expect(proceedButton.hasAttribute('disabled')).toBe(false)

    await user.click(proceedButton)

    expect(link.send).toHaveBeenCalledWith('tray:action', 'initOrigin', frameOriginId, {
      name: 'newframe-internal',
      chain: { id: chainId, type: 'ethereum' }
    })

    const providerCall = (link.rpc as Mock<any>).mock.calls.find((call) => call[0] === 'providerSend')
    expect(providerCall?.[1]).toMatchObject({
      jsonrpc: '2.0',
      method: 'eth_sendTransaction',
      chainId: '0x7a69',
      _origin: frameOriginId,
      params: [
        {
          from: sender.address,
          to: recipient.address,
          value: '0xde0b6b3a7640000',
          chainId: '0x7a69'
        }
      ]
    })
    expect(await screen.findByText('Transaction submitted')).toBeTruthy()
  })

  it('keeps recipient resolution errors visible without sending a provider request', async () => {
    ;(link.rpc as Mock<any>).mockImplementation((method: string, _name: string, callback: any) => {
      if (method === 'resolveName') callback(new Error('not found'))
    })

    render(<Send assetId={nativeAssetId} />)

    fireEvent.change(screen.getByLabelText('Recipient'), {
      target: { value: 'unknown.eth' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Proceed' }))

    expect(await screen.findByText('Could not resolve recipient.')).toBeTruthy()
    expect((link.rpc as Mock<any>).mock.calls.some((call) => call[0] === 'providerSend')).toBe(false)
  })
})
