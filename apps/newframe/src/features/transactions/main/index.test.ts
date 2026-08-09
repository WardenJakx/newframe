import { describe, expect, it, mock } from 'bun:test'

import { addHexPrefix, stripHexPrefix } from '@ethereumjs/util'
import { Common, Mainnet } from '@ethereumjs/common'

import * as transactionModule from './index'

// real functions under test, exercised with partial tx fixtures
const { maxFee, londonToLegacy, signerCompatibility, populate, sign, classifyTransaction } =
  transactionModule as Record<string, any>
import { GasFeesSource } from '../domain'
import { TxClassification } from '../../requests/contract/requests'

describe('#signerCompatibility', () => {
  it('accepts every signer for legacy transactions', () => {
    expect(signerCompatibility({ type: '0x0' }, { type: 'unrecognized' })).toStrictEqual({
      signer: 'unrecognized',
      tx: 'legacy',
      compatible: true
    })
  })

  it('accepts application-owned seed and ring signers for London transactions', () => {
    for (const type of ['seed', 'ring']) {
      expect(signerCompatibility({ type: '0x2' }, { type })).toStrictEqual({
        signer: type,
        tx: 'london',
        compatible: true
      })
    }
  })

  it('enforces each hardware signer firmware boundary', () => {
    const cases = [
      { type: 'ledger', appVersion: { major: 1, minor: 7, patch: 4 }, compatible: false },
      { type: 'ledger', appVersion: { major: 1, minor: 9, patch: 0 }, compatible: true },
      { type: 'ledger', appVersion: { major: 2, minor: 1, patch: 3 }, compatible: true },
      { type: 'lattice', appVersion: { major: 0, minor: 10, patch: 0 }, compatible: false },
      { type: 'lattice', appVersion: { major: 0, minor: 11, patch: 2 }, compatible: true },
      { type: 'lattice', appVersion: { major: 1, minor: 0, patch: 2 }, compatible: true },
      {
        type: 'trezor',
        model: 'Trezor One',
        appVersion: { major: 1, minor: 10, patch: 0 },
        compatible: false
      },
      {
        type: 'trezor',
        model: 'Trezor One',
        appVersion: { major: 1, minor: 10, patch: 4 },
        compatible: true
      },
      {
        type: 'trezor',
        model: 'Trezor T',
        appVersion: { major: 2, minor: 4, patch: 0 },
        compatible: false
      },
      {
        type: 'trezor',
        model: 'Trezor T',
        appVersion: { major: 2, minor: 4, patch: 2 },
        compatible: true
      },
      {
        type: 'trezor',
        model: 'Trezor T',
        appVersion: { major: 2, minor: 5, patch: 1 },
        compatible: true
      },
      {
        type: 'trezor',
        model: 'Trezor T',
        appVersion: { major: 3, minor: 2, patch: 4 },
        compatible: true
      }
    ]

    for (const { compatible, ...signer } of cases) {
      expect(signerCompatibility({ type: '0x2' }, signer)).toStrictEqual({
        signer: signer.type,
        tx: 'london',
        compatible
      })
    }
  })
})

describe('#londonToLegacy', () => {
  it('leaves a legacy transaction untouched', () => {
    const rawTx = {
      type: '0x0',
      gasPrice: '0x165a0bc00',
      gasLimit: '0x61a8',
      value: '0x6f05b59d3b20000',
      to: '0x6635f83421bf059cd8111f180f0727128685bae4',
      data: '0x0000000000000000000006635f83421bf059cd8111f180f0726635f83421bf059cd8111f180f072'
    }

    const tx = londonToLegacy(rawTx)

    expect(parseInt(tx.type)).toBe(0)
    expect(tx.gasPrice).toBe(rawTx.gasPrice)
    expect(tx.gasLimit).toBe(rawTx.gasLimit)
    expect(tx.maxFeePerGas).toBe(undefined)
    expect(tx.maxPriorityFeePerGas).toBe(undefined)
    expect(tx.value).toBe(rawTx.value)
    expect(tx.to).toBe(rawTx.to)
    expect(tx.data).toBe(rawTx.data)
  })

  it('converts a London transaction to a legacy transaction', () => {
    const rawTx = {
      type: '0x2',
      maxFeePerGas: addHexPrefix((7e9).toString(16)),
      maxPriorityFeePerGas: addHexPrefix((2e9).toString(16)),
      gasLimit: '0x61a8',
      value: '0x6f05b59d3b20000',
      to: '0x6635f83421bf059cd8111f180f0727128685bae4',
      data: '0x0000000000000000000006635f83421bf059cd8111f180f0726635f83421bf059cd8111f180f072'
    }

    const tx = londonToLegacy(rawTx)

    expect(parseInt(tx.type)).toBe(0)
    expect(tx.gasPrice).toBe(addHexPrefix((7e9).toString(16)))
    expect(tx.gasLimit).toBe(rawTx.gasLimit)
    expect(tx.maxFeePerGas).toBe(undefined)
    expect(tx.maxPriorityFeePerGas).toBe(undefined)
    expect(tx.value).toBe(rawTx.value)
    expect(tx.to).toBe(rawTx.to)
    expect(tx.data).toBe(rawTx.data)
  })
})

describe('#maxFee', () => {
  it('sets the max fee as 2 ETH on mainnet', () => {
    const tx = {
      chainId: addHexPrefix((1).toString(16))
    }

    expect(maxFee(tx)).toBe(2e18)
  })

  it('sets the max fee as 250 FTM on Fantom', () => {
    const tx = {
      chainId: addHexPrefix((250).toString(16))
    }

    expect(maxFee(tx)).toBe(250e18)
  })

  it('sets the max fee as 50 on other chains', () => {
    const tx = {
      chainId: addHexPrefix((255).toString(16))
    }

    expect(maxFee(tx)).toBe(5e19)
  })
})

describe('#populate', () => {
  const rawTx = {
    gasLimit: '0x61a8',
    value: '0x6f05b59d3b20000',
    to: '0x6635f83421bf059cd8111f180f0727128685bae4',
    data: '0x0000000000000000000006635f83421bf059cd8111f180f0726635f83421bf059cd8111f180f072',
    gasFeesSource: GasFeesSource.Dapp
  }

  describe('legacy transactions', () => {
    const chainConfig = new Common({ chain: Mainnet, hardfork: 'istanbul' })
    const frameGasPrice = addHexPrefix((7e9).toString(16))
    const gas = { price: { levels: { fast: frameGasPrice } } }

    it('uses the Frame gas price for missing and invalid dapp values', () => {
      for (const gasPrice of [undefined, '']) {
        const input = { ...rawTx, ...(gasPrice === undefined ? {} : { gasPrice }) }

        expect(populate(input, chainConfig, gas)).toStrictEqual({
          ...input,
          type: '0x0',
          gasPrice: frameGasPrice,
          gasFeesSource: GasFeesSource.Frame
        })
      }
    })

    it('preserves a valid dapp gas price and ownership', () => {
      const input = { ...rawTx, gasPrice: (6e9).toString(16) }

      expect(populate(input, chainConfig, gas)).toStrictEqual({
        ...input,
        type: '0x0'
      })
    })
  })

  describe('eip-1559 transactions', () => {
    const chainConfig = new Common({ chain: Mainnet, hardfork: 'london' })
    const frameBaseFee = addHexPrefix((7e9).toString(16))
    const framePriorityFee = addHexPrefix((3e9).toString(16))
    const gas = {
      price: {
        levels: { fast: '' },
        fees: {
          maxPriorityFeePerGas: framePriorityFee,
          maxBaseFeePerGas: frameBaseFee
        }
      }
    }

    it('uses complete Frame fees for missing and invalid dapp fee pairs', () => {
      for (const supplied of [{}, { maxFeePerGas: '', maxPriorityFeePerGas: '' }]) {
        const input = { ...rawTx, ...supplied }

        expect(populate(input, chainConfig, gas)).toStrictEqual({
          ...input,
          type: '0x2',
          maxFeePerGas: addHexPrefix((10e9).toString(16)),
          maxPriorityFeePerGas: framePriorityFee,
          gasFeesSource: GasFeesSource.Frame
        })
      }
    })

    it('combines one valid dapp fee with the complementary Frame fee without changing ownership', () => {
      const dappPriorityFee = addHexPrefix((4e9).toString(16))
      const dappMaxFee = (6e9).toString(16)
      const cases = [
        {
          input: { ...rawTx, maxPriorityFeePerGas: dappPriorityFee },
          expected: {
            ...rawTx,
            type: '0x2',
            maxPriorityFeePerGas: dappPriorityFee,
            maxFeePerGas: addHexPrefix((11e9).toString(16))
          }
        },
        {
          input: { ...rawTx, maxFeePerGas: dappMaxFee },
          expected: {
            ...rawTx,
            type: '0x2',
            maxFeePerGas: dappMaxFee,
            maxPriorityFeePerGas: framePriorityFee
          }
        }
      ]

      for (const { input, expected } of cases) {
        expect(populate(input, chainConfig, gas)).toStrictEqual(expected)
      }
    })

    it('preserves a complete valid dapp fee pair', () => {
      const input = {
        ...rawTx,
        maxFeePerGas: (6e9).toString(16),
        maxPriorityFeePerGas: (4e9).toString(16)
      }

      expect(populate(input, chainConfig, gas)).toStrictEqual({
        ...input,
        type: '0x2'
      })
    })
  })

  describe('eip-2930 transactions', () => {
    const chainConfig = new Common({ chain: Mainnet, hardfork: 'berlin' })

    it('projects the complete access-list fee result', () => {
      expect(populate(rawTx, chainConfig, { price: { levels: { fast: '' } } })).toStrictEqual({
        ...rawTx,
        type: '0x1',
        gasPrice: '0x0',
        gasFeesSource: GasFeesSource.Frame
      })
    })
  })
})

describe('#sign', () => {
  const baseTx = {
    chainId: '0x1',
    nonce: '0x33',
    gasLimit: '0x61a8',
    value: '0x6f05b59d3b20000',
    to: '0x6635f83421bf059cd8111f180f0727128685bae4',
    data: '0x00000000000000000000006635f83421bf059cd8111f180f0726635f83421bf059cd8111f180f072'
  }

  const signature = {
    v: '0x00',
    r: '0xd693b532a80fed6392b428604171fb32fdbf953728a3a7ecc7d4062b1652c042',
    s: '0x24e9c602ac800b983b035700a14b23f78a253ab762deab5dc27e3555a750b354'
  }

  it('generates a signed legacy transaction', async () => {
    const rawTx = {
      ...baseTx,
      type: '0x0',
      gasPrice: '0x737be7600'
    }

    const sig = {
      ...signature,
      v: addHexPrefix((27).toString(16))
    }

    const { type, chainId, ...expectedFields } = rawTx
    const signedTx = await sign(rawTx, mock().mockResolvedValueOnce(sig))

    expect(signedTx.toJSON()).toMatchObject({
      ...expectedFields,
      ...signature,
      v: '0x1b'
    })
  })

  it('generates a signed eip-1559 transaction', async () => {
    const rawTx = {
      ...baseTx,
      type: '0x2',
      maxFeePerGas: '0x737be7600',
      maxPriorityFeePerGas: '0x3'
    }

    const { type, ...expectedFields } = rawTx
    const signedTx = await sign(rawTx, mock().mockResolvedValueOnce(signature))

    expect(signedTx.toJSON()).toMatchObject({
      ...expectedFields,
      ...signature,
      v: '0x0' // additional zeroes are stripped
    })
  })

  it('adds hex prefixes to the signature', async () => {
    const signedTx = await sign(
      baseTx,
      mock().mockResolvedValueOnce({
        v: stripHexPrefix('0x1b'),
        r: stripHexPrefix(signature.r),
        s: stripHexPrefix(signature.s)
      })
    )

    expect(signedTx.toJSON()).toMatchObject({
      ...signature,
      v: '0x1b'
    })
  })
})

describe('#classifyTransaction', () => {
  const method = 'eth_sendTransaction'
  const from = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045'
  const to = '0x2f3a40a3db8a7e3d09b0adfefbce4f6f81927557'
  const Request = (param: any, recipientType: any) => ({
    payload: {
      method,
      params: [param]
    },
    recipientType
  })

  describe('contract deployments', () => {
    it('should classify transactions with data and no recipient as contract deployments', () => {
      const request = Request(
        {
          from,
          data: '0x6080604052'
        },
        'unknown'
      )

      expect(classifyTransaction(request)).toBe(TxClassification.CONTRACT_DEPLOY)
    })

    it('should classify transactions with data, a value, and no recipient as contract deployments', () => {
      const request = Request(
        {
          from,
          data: '0x6080604052',
          value: '0x01'
        },
        'unknown'
      )

      expect(classifyTransaction(request)).toBe(TxClassification.CONTRACT_DEPLOY)
    })

    it('should classify transactions with a value, and no recipient or data as contract deployments', () => {
      const request = Request(
        {
          from,
          data: '0x',
          value: '0x01'
        },
        'unknown'
      )

      expect(classifyTransaction(request)).toBe(TxClassification.CONTRACT_DEPLOY)
    })

    it('should classify transactions with no recipient, data, or value as contract deployments', () => {
      const request = Request(
        {
          from,
          data: '0x',
          value: '0x'
        },
        'unknown'
      )

      expect(classifyTransaction(request)).toBe(TxClassification.CONTRACT_DEPLOY)
    })
  })

  describe('sending data', () => {
    it('should classify transactions which contain data, with an external recipeient, as sending data', () => {
      const request = Request(
        {
          from,
          to,
          data: '0x6080604052'
        },
        'external'
      )

      expect(classifyTransaction(request)).toBe(TxClassification.SEND_DATA)
    })

    it('should classify transactions which contain data, with an external recipient and a non-zero value, as sending data', () => {
      const request = Request(
        {
          from,
          to,
          data: '0x6080604052',
          value: '0x01'
        },
        'external'
      )

      expect(classifyTransaction(request)).toBe(TxClassification.SEND_DATA)
    })

    it('should classify transactions which contain data, with an unknown recipient, as contract calls', () => {
      const request = Request(
        {
          from,
          to,
          data: '0x6080604052'
        },
        'unknown'
      )

      expect(classifyTransaction(request)).toBe(TxClassification.CONTRACT_CALL)
    })
    it('should classify transactions which contain data, with an unknown recipient and a non-zero value, as contract calls', () => {
      const request = Request(
        {
          from,
          to,
          data: '0x6080604052',
          value: '0x01'
        },
        'unknown'
      )

      expect(classifyTransaction(request)).toBe(TxClassification.CONTRACT_CALL)
    })
  })

  describe('contract calls', () => {
    it('should classify transactions with data and a contract recipient as contract calls', () => {
      const request = Request(
        {
          from,
          to,
          data: '0x6080604052'
        },
        'contract'
      )

      expect(classifyTransaction(request)).toBe(TxClassification.CONTRACT_CALL)
    })

    it('should classify transactions with data, a value, and a contract recipient as contract calls', () => {
      const request = Request(
        {
          from,
          to,
          data: '0x6080604052',
          value: '0x01'
        },
        'contract'
      )

      expect(classifyTransaction(request)).toBe(TxClassification.CONTRACT_CALL)
    })
  })

  describe('native transfers', () => {
    it('should classify transactions with an external recipient and no data as native transfers', () => {
      const request = Request(
        {
          from,
          to,
          value: '0x01'
        },
        'external'
      )

      expect(classifyTransaction(request)).toBe(TxClassification.NATIVE_TRANSFER)
    })

    it('should classify transactions with an external recipient and no data or value as native transfers', () => {
      const request = Request(
        {
          from,
          to,
          value: '0x0'
        },
        'external'
      )

      expect(classifyTransaction(request)).toBe(TxClassification.NATIVE_TRANSFER)
    })

    it('should classify transactions with a contract recipient and no data as native transfers', () => {
      const request = Request(
        {
          from,
          to,
          value: '0x01'
        },
        'contract'
      )

      expect(classifyTransaction(request)).toBe(TxClassification.NATIVE_TRANSFER)
    })
    it('should classify transactions with a contract recipient and no data or value as native transfers', () => {
      const request = Request(
        {
          from,
          to,
          value: '0x0'
        },
        'contract'
      )

      expect(classifyTransaction(request)).toBe(TxClassification.NATIVE_TRANSFER)
    })
  })
})
