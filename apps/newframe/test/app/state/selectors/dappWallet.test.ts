import { createDappWalletSelector } from '../../../../app/state/selectors/dappWallet'
import { NATIVE_CURRENCY } from '../../../../resources/constants'

describe('createDappWalletSelector', () => {
  it('returns ordered accounts and current-account balance summaries', () => {
    const sender = { id: 'sender', address: '0xsender', name: 'Sender' }
    const recipient = { id: 'recipient', address: '0xrecipient', name: 'Recipient' }
    const selectDappWallet = createDappWalletSelector()
    const state = {
      selected: { current: sender.id },
      main: {
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
        networks: {
          ethereum: {
            31337: {
              id: 31337,
              name: 'Local',
              on: true
            }
          }
        },
        networksMeta: {
          ethereum: {
            31337: {
              nativeCurrency: {
                symbol: 'ETH',
                name: 'Ether',
                decimals: 18,
                usd: { price: 1000, change24hr: 0 }
              }
            }
          }
        },
        rates: {}
      }
    }

    const result = selectDappWallet(state)

    expect(result.accounts.map((account) => account.id)).toEqual(['recipient', 'sender'])
    expect(result.currentAccount).toBe(sender)
    expect(result.balanceSummaries).toHaveLength(1)
    expect(result.balanceSummaries[0].symbol).toBe('ETH')
    expect(selectDappWallet(state)).toBe(result)
  })

  it('keeps the snapshot stable for an account whose balances have not loaded yet', () => {
    const account = { id: 'new', address: '0xnew', name: 'New Account' }
    const selectDappWallet = createDappWalletSelector()
    const state = {
      selected: { current: account.id },
      main: {
        accounts: { [account.id]: account },
        accountOrder: [account.id],
        balances: {},
        networks: { ethereum: {} },
        networksMeta: { ethereum: {} },
        rates: {}
      }
    }

    const result = selectDappWallet(state)

    expect(result.balanceSummaries).toEqual([])
    expect(selectDappWallet(state)).toBe(result)
  })
})
