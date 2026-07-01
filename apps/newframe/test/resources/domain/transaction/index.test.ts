import {
  getPaidTransactionFee,
  getTransactionEffects,
  getTransactionIntent,
  normalizeChainId,
  typeSupportsBaseFee,
  usesBaseFee
} from '../../../../resources/domain/transaction'

describe('#typeSupportsBaseFee', () => {
  it('does not support a base fee for type 0', () => {
    expect(typeSupportsBaseFee('0x0')).toBe(false)
  })

  it('does not support a base fee for type 1', () => {
    expect(typeSupportsBaseFee('0x1')).toBe(false)
  })

  it('supports a base fee for type 2', () => {
    expect(typeSupportsBaseFee('0x2')).toBe(true)
  })
})

describe('#usesBaseFee', () => {
  it('does not use a base fee for transaction type 0', () => {
    const tx = {
      type: '0x0'
    }

    expect(usesBaseFee(tx as any)).toBe(false)
  })

  it('does not use a base fee for transaction type 1', () => {
    const tx = {
      type: '0x1'
    }

    expect(usesBaseFee(tx as any)).toBe(false)
  })

  it('uses a base fee for transaction type 2', () => {
    const tx = {
      type: '0x2'
    }

    expect(usesBaseFee(tx as any)).toBe(true)
  })
})

describe('#normalizeChainId', () => {
  it('does not modify a transaction with no chain id', () => {
    const tx = { to: '0xframe' }

    expect(normalizeChainId(tx as any)).toStrictEqual(tx)
  })

  it('normalizes a hex-prefixed chain id', () => {
    const tx = { to: '0xframe', chainId: '0xa' }

    expect(normalizeChainId(tx as any)).toStrictEqual({ to: '0xframe', chainId: '0xa' })
  })

  it('does not handle a hex chain id with no prefix', () => {
    const tx = { to: '0xframe', chainId: 'a' }

    expect(() => normalizeChainId(tx as any)).toThrow(/chain for transaction.*is not a hex-prefixed string/i)
  })

  it('normalizes a numeric chain id', () => {
    const tx = { to: '0xframe', chainId: 14 }

    expect(normalizeChainId(tx as any)).toStrictEqual({ to: '0xframe', chainId: '0xe' })
  })

  it('normalizes a numeric string chain id', () => {
    const tx = { to: '0xframe', chainId: '100' }

    expect(normalizeChainId(tx as any)).toStrictEqual({ to: '0xframe', chainId: '0x64' })
  })

  it('does not allow a chain id that does not match the target chain', () => {
    const tx = { to: '0xframe', chainId: '0xa' }

    expect(() => normalizeChainId(tx, 11)).toThrow(
      /chain for transaction.*does not match request target chain/i
    )
  })
})

describe('#getTransactionIntent', () => {
  it('summarizes a recognized token transfer', () => {
    const req = {
      recognizedActions: [
        {
          id: 'erc20:transfer',
          data: {
            name: 'USD Coin',
            symbol: 'USDC'
          }
        }
      ]
    }

    expect(getTransactionIntent(req).title).toBe('Send USDC')
    expect(getTransactionIntent(req).subtitle).toBe('USD Coin')
  })

  it('falls back to decoded contract calls', () => {
    const req = {
      classification: 'CONTRACT_CALL',
      decodedData: {
        method: 'depositEth',
        contractName: 'TestContract'
      }
    }

    expect(getTransactionIntent(req).title).toBe('depositEth')
    expect(getTransactionIntent(req).subtitle).toBe('TestContract')
  })

  it('summarizes decoded erc20 approvals when recognition is unavailable', () => {
    const req = {
      tokenData: {
        name: 'USD Coin',
        symbol: 'USDC',
        decimals: 6
      },
      decodedData: {
        method: 'approve',
        signature: 'approve(address,uint256)',
        args: [{ value: '0x0000000000000000000000000000000000001337' }, { value: '25000000' }]
      }
    }

    expect(getTransactionIntent(req).title).toBe('Approve USDC')
    expect(getTransactionIntent(req).subtitle).toBe('USD Coin')
  })
})

describe('#getTransactionEffects', () => {
  it('shows native value as asset out', () => {
    const effects = getTransactionEffects({
      data: {
        value: '0x2386f26fc10000'
      }
    })

    expect(effects).toStrictEqual([
      {
        id: 'native-value-out',
        kind: 'native',
        direction: 'out',
        label: 'Asset out',
        amount: '0x2386f26fc10000',
        decimals: 18,
        symbol: 'ETH',
        detail: 'Transaction value'
      }
    ])
  })

  it('shows recognized erc20 transfers as asset out', () => {
    const effects = getTransactionEffects({
      recognizedActions: [
        {
          id: 'erc20:transfer',
          data: {
            amount: '0x17d7840',
            decimals: 6,
            symbol: 'USDC',
            recipient: {
              address: '0x0000000000000000000000000000000000001337'
            }
          }
        }
      ]
    })

    expect(effects).toStrictEqual([
      {
        id: 'erc20-transfer-0',
        kind: 'erc20',
        direction: 'out',
        label: 'Asset out',
        amount: '0x17d7840',
        decimals: 6,
        symbol: 'USDC',
        detail: '0x000000...001337'
      }
    ])
  })

  it('shows approvals as allowance changes', () => {
    const effects = getTransactionEffects({
      recognizedActions: [
        {
          id: 'erc20:approve',
          data: {
            amount: '0x0',
            decimals: 18,
            symbol: 'DAI',
            spender: {
              ens: 'spender.eth',
              address: '0x0000000000000000000000000000000000001337'
            }
          }
        }
      ]
    })

    expect(effects).toStrictEqual([
      {
        id: 'erc20-approval-0',
        kind: 'allowance',
        direction: 'neutral',
        label: 'Allowance revoked',
        amount: '0x0',
        decimals: 18,
        symbol: 'DAI',
        detail: 'For spender.eth'
      }
    ])
  })

  it('shows decoded erc20 approvals as allowance changes when recognition is unavailable', () => {
    const effects = getTransactionEffects({
      data: {
        to: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
      },
      tokenData: {
        name: 'USD Coin',
        symbol: 'USDC',
        decimals: 6
      },
      decodedData: {
        method: 'approve',
        signature: 'approve(address,uint256)',
        args: [{ value: '0x0000000000000000000000000000000000001337' }, { value: '25000000' }]
      }
    })

    expect(effects).toStrictEqual([
      {
        id: 'decoded-erc20-approval',
        kind: 'allowance',
        direction: 'neutral',
        label: 'Allowance change',
        amount: '0x17d7840',
        decimals: 6,
        symbol: 'USDC',
        detail: 'For spender 0x000000...001337',
        assetAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
      }
    ])
  })

  it('shows decoded erc20 transfers as asset out when recognition is unavailable', () => {
    const effects = getTransactionEffects({
      data: {
        to: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
      },
      tokenData: {
        name: 'USD Coin',
        symbol: 'USDC',
        decimals: 6
      },
      decodedData: {
        method: 'transfer',
        signature: 'transfer(address,uint256)',
        args: [{ value: '0x0000000000000000000000000000000000001337' }, { value: '25000000' }]
      }
    })

    expect(effects).toStrictEqual([
      {
        id: 'decoded-erc20-transfer',
        kind: 'erc20',
        direction: 'out',
        label: 'Asset out',
        amount: '0x17d7840',
        decimals: 6,
        symbol: 'USDC',
        detail: '0x000000...001337',
        assetAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
      }
    ])
  })

  it('prefers simulated asset effects while preserving deterministic allowance effects', () => {
    const effects = getTransactionEffects({
      simulation: {
        status: 'success',
        effects: [
          {
            id: 'sim-erc20-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
            kind: 'erc20',
            direction: 'out',
            label: 'Asset out',
            amount: '0x17d7840',
            decimals: 6,
            symbol: 'USDC',
            detail: 'Simulated balance change',
            assetAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
          }
        ]
      },
      recognizedActions: [
        {
          id: 'erc20:approve',
          data: {
            amount: '0x17d7840',
            decimals: 6,
            symbol: 'USDC',
            spender: {
              address: '0x0000000000000000000000000000000000001337'
            }
          }
        }
      ]
    })

    expect(effects).toStrictEqual([
      {
        id: 'sim-erc20-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        kind: 'erc20',
        direction: 'out',
        label: 'Asset out',
        amount: '0x17d7840',
        decimals: 6,
        symbol: 'USDC',
        detail: 'Simulated balance change',
        assetAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
      },
      {
        id: 'erc20-approval-0',
        kind: 'allowance',
        direction: 'neutral',
        label: 'Allowance change',
        amount: '0x17d7840',
        decimals: 6,
        symbol: 'USDC',
        detail: 'For spender 0x000000...001337'
      }
    ])
  })
})

describe('#getPaidTransactionFee', () => {
  it('returns the receipt gas used times effective gas price', () => {
    expect(
      getPaidTransactionFee({
        tx: {
          receipt: {
            gasUsed: '0x5208',
            effectiveGasPrice: '0x3b9aca00'
          }
        }
      })
    ).toBe('0x1319718a5000')
  })
})
