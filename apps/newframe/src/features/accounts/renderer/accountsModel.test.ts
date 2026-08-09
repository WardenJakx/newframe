import { describe, expect, it } from 'bun:test'

import type { AccountProjection, SignerProjection } from './accountsModel'
import {
  accountBalanceLabel,
  accountMatchesQuery,
  buildAccountListModel,
  orderedAccountIds,
  shortAccountAddress
} from './accountsModel'
import { createBalanceSummarySelector } from '../../asset-data/domain/balance'
import { walletState } from '../../../platform/state-sync/renderer/fixtures.test-support.ts'
import type { WalletRendererState } from '../../../platform/state-sync/contract/projections'

const account = (id: string, created: string, name = id): AccountProjection => ({
  id,
  profileId: 'personal',
  address: id,
  name,
  lastSignerType: 'seed',
  status: 'ok',
  signer: 'seed-1',
  requests: {},
  created
})

describe('accounts model', () => {
  it('orders projected accounts first, appends created accounts, and filters semantic labels', () => {
    const first = account('0x0000000000000000000000000000000000000001', '2026-01-01', 'Primary')
    const second = account('0x0000000000000000000000000000000000000002', '2026-01-02', 'Savings')
    const accounts = { [first.id]: first, [second.id]: second }
    const signers = {
      'seed-1': {
        id: 'seed-1',
        type: 'seed',
        name: 'Recovery phrase',
        model: 'seed',
        status: 'ok',
        addresses: [first.address, second.address],
        appVersion: { major: 1, minor: 0, patch: 0 }
      } satisfies SignerProjection
    }

    expect(orderedAccountIds(accounts, [second.id])).toEqual([second.id, first.id])
    const projection = walletState({ accounts })
    const model = buildAccountListModel({
      accountOrder: [second.id],
      accounts,
      assetRates: projection.assetRates,
      balances: projection.balances,
      currentAccountId: first.id,
      networks: projection.networks.ethereum,
      networksMeta: projection.networksMeta.ethereum,
      profiles: [],
      query: 'primary',
      selectBalanceSummaries: createBalanceSummarySelector(),
      showLocalNameWithENS: false,
      showTestnets: false,
      signers,
      tokens: projection.tokens
    })

    expect(model.items.map((item) => item.id)).toEqual([first.id])
    expect(model.items[0]?.shortAddress).toBe(shortAccountAddress(first.address))
    expect(accountMatchesQuery(model.items[0]!, '0x000')).toBe(true)
  })

  it('models missing, unpriced, and priced balance labels from focused projection inputs', () => {
    const primary = account('0x0000000000000000000000000000000000000001', '2026-01-01')
    const token = '0x00000000000000000000000000000000000000aa'
    const projection = walletState({
      assetRates: { [`1:${token}`]: { usdRate: 2.5, source: 'zerion', observedAt: 1 } },
      balances: {
        [primary.address]: [
          {
            address: token,
            balance: '0x2',
            chainId: 1,
            displayBalance: ''
          }
        ]
      },
      networks: {
        ethereum: { 1: { id: 1, name: 'Mainnet', on: true, isTestnet: false, explorer: '' } }
      } as unknown as WalletRendererState['networks'],
      networksMeta: {
        ethereum: {
          1: {
            primaryColor: 'accent1',
            nativeCurrency: { symbol: 'ETH', icon: '', name: 'Ether', decimals: 18 }
          }
        }
      } as unknown as WalletRendererState['networksMeta'],
      tokens: {
        byId: {
          [`1:${token}`]: {
            address: token,
            chainId: 1,
            decimals: 0,
            name: 'Token',
            symbol: 'TOK',
            custom: false,
            curated: false,
            sources: ['onchain'],
            updatedAt: 1
          }
        },
        accountTokenIds: {}
      }
    })
    const label = (balances = projection.balances, assetRates = projection.assetRates) =>
      accountBalanceLabel({
        account: primary,
        assetRates,
        balances,
        networks: projection.networks.ethereum,
        networksMeta: projection.networksMeta.ethereum,
        selectBalanceSummaries: createBalanceSummarySelector(),
        showTestnets: false,
        tokens: projection.tokens
      })

    expect(label({})).toBe('---')
    expect(label(projection.balances, {})).toBe('—')
    expect(label()).toBe('$5.00')
  })
})
