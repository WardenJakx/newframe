import { describe, expect, it } from 'bun:test'

import { createSideTrayWalletSelector } from '../../../../app/state/selectors/sideTrayWallet'
import { NATIVE_CURRENCY } from '../../../../resources/constants'
import type { SideTrayRendererState } from '../../../../resources/state/projections'

const emptyCatalog = () => ({ byId: {}, accountTokenIds: {} })
const globalCatalog = (token: any, source: 'custom' | 'bundled' = 'custom') => ({
  byId: {
    [`${token.chainId}:${token.address}`]: {
      ...token,
      custom: source === 'custom',
      curated: source === 'bundled',
      sources: [source],
      updatedAt: 0
    }
  },
  accountTokenIds: {}
})

describe('createSideTrayWalletSelector', () => {
  it('returns ordered accounts and current-account balance summaries', () => {
    const sender = { id: 'sender', address: '0xsender', name: 'Sender', lastSignerType: 'address' }
    const recipient = {
      id: 'recipient',
      address: '0xrecipient',
      name: 'Recipient',
      lastSignerType: 'address'
    }
    const selectSideTrayWallet = createSideTrayWalletSelector()
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
            displayBalance: ''
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
      runtime: {},
      tokens: emptyCatalog()
    } satisfies SideTrayRendererState

    const result = selectSideTrayWallet(state)

    expect(result.accounts.map((account) => account.id)).toEqual(['recipient', 'sender'])
    expect(result.currentAccount).toBe(sender)
    expect(result.balanceSummaries).toHaveLength(1)
    expect(result.balanceSummaries[0].symbol).toBe('ETH')
    expect(selectSideTrayWallet(state)).toBe(result)
  })

  it('keeps the snapshot stable for an account whose balances have not loaded yet', () => {
    const account = { id: 'new', address: '0xnew', name: 'New Account', lastSignerType: 'address' }
    const selectSideTrayWallet = createSideTrayWalletSelector()
    const state = {
      accounts: { [account.id]: account },
      accountOrder: [account.id],
      balances: {},
      currentAccount: account.id,
      networks: { ethereum: {} },
      networksMeta: { ethereum: {} },
      rates: {},
      runtime: {},
      tokens: emptyCatalog()
    } satisfies SideTrayRendererState

    const result = selectSideTrayWallet(state)

    expect(result.balanceSummaries).toEqual([])
    expect(selectSideTrayWallet(state)).toBe(result)
  })

  it('includes custom tokens with no balance on enabled chains', () => {
    const account = { id: 'sender', address: '0xsender', name: 'Sender', lastSignerType: 'address' }
    const customToken = {
      address: '0x00000000000000000000000000000000000000aa',
      chainId: 1,
      decimals: 6,
      image: {
        base64: 'aWNvbg==',
        contentHash: 'token-image',
        mimeType: 'image/png'
      },
      name: 'Custom Dollar',
      symbol: 'CUSD'
    }
    const selectSideTrayWallet = createSideTrayWalletSelector()
    const state = {
      accounts: { [account.id]: account },
      accountOrder: [account.id],
      balances: { [account.address]: [] },
      currentAccount: account.id,
      networks: {
        ethereum: {
          1: { id: 1, name: 'Mainnet', on: true, isTestnet: false, explorer: '' }
        }
      },
      networksMeta: {
        ethereum: {
          1: {
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
      runtime: {},
      tokens: globalCatalog(customToken)
    } satisfies SideTrayRendererState

    const result = selectSideTrayWallet(state)

    expect(result.balanceSummaries).toHaveLength(1)
    expect(result.balanceSummaries[0]).toMatchObject({
      address: customToken.address,
      balance: '0x0',
      logoURI: 'data:image/png;base64,aWNvbg==',
      symbol: 'CUSD'
    })
  })

  it('includes bundled tokens with no balance on enabled chains', () => {
    const account = { id: 'sender', address: '0xsender', name: 'Sender', lastSignerType: 'address' }
    const bundledToken = {
      address: '0x00000000000000000000000000000000000000bb',
      chainId: 1,
      decimals: 18,
      name: 'Bundled Token',
      symbol: 'BTKN'
    }
    const selectSideTrayWallet = createSideTrayWalletSelector()
    const state = {
      accounts: { [account.id]: account },
      accountOrder: [account.id],
      balances: { [account.address]: [] },
      currentAccount: account.id,
      networks: {
        ethereum: {
          1: { id: 1, name: 'Mainnet', on: true, isTestnet: false, explorer: '' }
        }
      },
      networksMeta: {
        ethereum: {
          1: {
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
      runtime: {},
      tokens: globalCatalog(bundledToken, 'bundled')
    } satisfies SideTrayRendererState

    expect(selectSideTrayWallet(state).balanceSummaries[0]).toMatchObject({
      address: bundledToken.address,
      balance: '0x0',
      symbol: 'BTKN'
    })
  })
})
