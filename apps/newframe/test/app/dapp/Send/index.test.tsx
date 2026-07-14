import type { Mock } from 'bun:test'

import { fireEvent, render, screen } from '../../../componentSetup'
import Send from '../../../../app/dapp/Send'
import {
  applyStateMessage,
  beginStateConnection,
  resetStateMirrorForTests
} from '../../../../app/state/rendererStore'
import { NATIVE_CURRENCY } from '../../../../resources/constants'
import link from '../../../../resources/link'
import { STATE_STREAM_SCHEMA_VERSION } from '../../../../resources/state/protocol'

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
  resetStateMirrorForTests()
  beginStateConnection('dapp')
  applyStateMessage({
    schemaVersion: STATE_STREAM_SCHEMA_VERSION,
    streamId: 'send-test',
    revision: 0,
    state: {
      currentAccount: sender.id,
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
            explorer: '',
            isTestnet: true,
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
      },
      runtime: {
        profile: 'dev',
        isDev: true,
        environment: 'test'
      }
    }
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
  beforeEach(() => {
    initializeSendState()
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

    expect(screen.getByRole('button', { name: 'Select send token' }).textContent).toContain('USDC')
  })

  it('does not show the sending wallet as a recipient option', () => {
    render(<Send assetId={nativeAssetId} />)

    expect(screen.getByText('Recipient')).toBeTruthy()
    expect(screen.queryByText('Sender')).toBeNull()
    expect(screen.queryByText(sender.address)).toBeNull()
  })

  it('submits a native transfer through the Send service flow', async () => {
    ;(link.executeCommand as Mock<any>).mockImplementation(async (command: any) => {
      if (command.type === 'transaction.submit') {
        return { ok: true, transactionHash: `0x${'1'.repeat(64)}` }
      }

      return { ok: true }
    })

    const { user } = render(<Send assetId={nativeAssetId} />)
    const recipientButton = screen.getByText('Recipient').closest('button') as HTMLButtonElement

    await user.click(recipientButton)

    const proceedButton = screen.getByRole('button', { name: 'Proceed' })
    expect(proceedButton.hasAttribute('disabled')).toBe(false)

    await user.click(proceedButton)

    expect(link.executeCommand).toHaveBeenCalledWith({
      type: 'transaction.submit',
      idempotencyKey: expect.any(String),
      chainId,
      transaction: {
        to: recipient.address,
        value: '0xde0b6b3a7640000'
      }
    })
    expect(await screen.findByText('Transaction submitted')).toBeTruthy()
  })

  it('keeps recipient resolution errors visible without sending a provider request', async () => {
    ;(link.executeQuery as Mock<any>).mockResolvedValueOnce({ ok: false, error: 'not_found' })

    render(<Send assetId={nativeAssetId} />)

    fireEvent.change(screen.getByLabelText('Recipient'), {
      target: { value: 'unknown.eth' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Proceed' }))

    expect(await screen.findByText('Could not resolve recipient.')).toBeTruthy()
    expect(link.executeQuery).toHaveBeenCalledWith({ type: 'name.resolve', name: 'unknown.eth' })
    expect(
      (link.executeCommand as Mock<any>).mock.calls.some(
        ([command]) => (command as { type?: string }).type === 'transaction.submit'
      )
    ).toBe(false)
  })
})
