import { createDappWalletSelector } from '../../../../app/state/selectors/dappWallet'
import { NATIVE_CURRENCY } from '../../../../resources/constants'
import type { DappRendererState } from '../../../../resources/state/projections'

describe('createDappWalletSelector', () => {
  it('returns ordered accounts and current-account balance summaries', () => {
    const sender = { id: 'sender', address: '0xsender', name: 'Sender', lastSignerType: 'address' }
    const recipient = {
      id: 'recipient',
      address: '0xrecipient',
      name: 'Recipient',
      lastSignerType: 'address'
    }
    const selectDappWallet = createDappWalletSelector()
    const state = {
      accounts: {
        [sender.id]: sender,
        [recipient.id]: recipient
      },
      accountOrder: [recipient.id, sender.id],
      balances: {
        [sender.address]: [
          {
            address: NATIVE_CURRENCY,
            balance: '0xde0b6b3a7640000',
            chainId: 31337,
            decimals: 18,
            displayBalance: '',
            name: 'Ether',
            symbol: 'ETH'
          }
        ]
      },
      currentAccount: sender.id,
      networks: {
        ethereum: {
          31337: {
            id: 31337,
            name: 'Local',
            on: true,
            isTestnet: true,
            explorer: ''
          }
        }
      },
      networksMeta: {
        ethereum: {
          31337: {
            icon: '',
            primaryColor: 'accent1',
            nativeCurrency: {
              symbol: 'ETH',
              icon: '',
              name: 'Ether',
              decimals: 18,
              usd: { price: 1000, change24hr: 0 }
            }
          }
        }
      },
      rates: {},
      runtime: {}
    } satisfies DappRendererState

    const result = selectDappWallet(state)

    expect(result.accounts.map((account) => account.id)).toEqual(['recipient', 'sender'])
    expect(result.currentAccount).toBe(sender)
    expect(result.balanceSummaries).toHaveLength(1)
    expect(result.balanceSummaries[0].symbol).toBe('ETH')
    expect(selectDappWallet(state)).toBe(result)
  })

  it('keeps the snapshot stable for an account whose balances have not loaded yet', () => {
    const account = { id: 'new', address: '0xnew', name: 'New Account', lastSignerType: 'address' }
    const selectDappWallet = createDappWalletSelector()
    const state = {
      accounts: { [account.id]: account },
      accountOrder: [account.id],
      balances: {},
      currentAccount: account.id,
      networks: { ethereum: {} },
      networksMeta: { ethereum: {} },
      rates: {},
      runtime: {}
    } satisfies DappRendererState

    const result = selectDappWallet(state)

    expect(result.balanceSummaries).toEqual([])
    expect(selectDappWallet(state)).toBe(result)
  })
})
