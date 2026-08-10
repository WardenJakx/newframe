import { beforeEach, describe, expect, it } from 'bun:test'

import { fireEvent, screen, render } from '../../../../../../../test/support/componentSetup'
import { within } from '@testing-library/react'
import TxRequest, { TransactionRequest } from './index'
import { RequestViewProvider } from '../../../requestView'
import { RequestStatus, TxClassification } from '../../../../contract/requests'
import { erc20Interface } from '../../../../../../shared/domain/evm'
import { registerTestRuntimeFixture } from '../../../../../../../test/support/rendererClient'
import { shortAddress } from '../../../../../../shared/renderer/ui/AddressIdentity'
import {
  createRequestRendererCapabilitiesFake as createRequestPortsFake,
  type RequestRendererCapabilitiesFake
} from '../../../requestCapabilities.test-support'
import type { TransactionRequestView } from '../requestViewTypes'

const fixture = registerTestRuntimeFixture()
let capabilities: RequestRendererCapabilitiesFake
type TransactionRequestFixture = Omit<
  Partial<TransactionRequestView>,
  'account' | 'data' | 'handlerId' | 'origin' | 'payload' | 'tx' | 'type'
> & {
  account?: string
  data: Partial<TransactionRequestView['data']> & Pick<TransactionRequestView['data'], 'chainId'>
  handlerId: string
  origin: string
  payload?: Partial<TransactionRequestView['payload']> & Record<string, unknown>
  tx?: TransactionRequestView['tx'] & { confirmations?: number }
  type: 'transaction'
}

function completeRequest(req: TransactionRequestFixture): TransactionRequestView {
  const { account, data, payload, ...request } = req
  const params = payload?.params ?? [{ chainId: data.chainId }]
  return {
    ...request,
    account: account ?? '0x0000000000000000000000000000000000000001',
    data: { type: '0x0', gasFeesSource: 'Frame', ...data },
    payload: {
      id: 1,
      jsonrpc: '2.0',
      method: 'eth_sendTransaction',
      _origin: req.origin,
      ...payload,
      params
    }
  }
}

const renderRequest = (req: TransactionRequestFixture) =>
  render(
    <RequestViewProvider>
      <TxRequest capabilities={capabilities} req={completeRequest(req)} />
    </RequestViewProvider>
  )

beforeEach(() => {
  capabilities = createRequestPortsFake()
  fixture.state.reset({
    assetRates: {},
    networks: {
      ethereum: {
        137: { name: 'Polygon', isTestnet: false }
      }
    },
    networksMeta: {
      ethereum: {
        137: {
          nativeCurrency: { symbol: 'MATIC' }
        }
      }
    },
    origins: {
      'test-origin': { name: 'Test Dapp' }
    },
    windows: {
      panel: { nav: [] }
    }
  })
})

describe('confirm', () => {
  it('renders a transaction notice', () => {
    const req = {
      handlerId: 'test-req',
      type: 'transaction',
      status: RequestStatus.Confirming,
      notice: 'insufficient funds for gas',
      origin: 'test-origin',
      recipientType: 'external',
      data: {
        chainId: '0x89'
      },
      classification: TxClassification.NATIVE_TRANSFER
    } satisfies TransactionRequestFixture

    renderRequest(req)

    const notice = screen.getByRole('alert')
    expect(notice.textContent).toMatch(/insufficient funds for gas/i)
  })

  it('uses the request status and keeps gas settings collapsed', () => {
    const req = {
      handlerId: 'test-req',
      type: 'transaction',
      status: RequestStatus.Confirming,
      origin: 'test-origin',
      tx: {
        hash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        confirmations: 1
      },
      data: {
        chainId: '0x89',
        gasLimit: '0x5208',
        gasPrice: '0x3b9aca00',
        type: '0x0'
      },
      classification: TxClassification.CONTRACT_CALL
    } satisfies TransactionRequestFixture

    renderRequest(req)

    expect(screen.queryByLabelText('Transaction progress')).toBeNull()
    expect(screen.getByRole('status').textContent).toBe('confirming')
    expect(screen.getByRole('button', { name: /show gas fee settings/i })).toBeTruthy()
    expect(screen.getByLabelText('Network fee').textContent).toMatch(/gas fee/i)
  })

  it('promotes request identity and resolves ERC-20 transfers to their recipient', () => {
    const tokenAddress = '0x00000000000000000000000000000000000000aa'
    const recipientAddress = '0x0000000000000000000000000000000000001337'
    const senderAddress = '0x0000000000000000000000000000000000000042'
    fixture.state.reset({
      assetRates: {},
      accounts: {
        account: {
          id: 'account',
          address: senderAddress,
          name: 'testname',
          signer: 'signer',
          requests: {}
        }
      },
      networks: { ethereum: { 137: { name: 'Polygon', isTestnet: false } } },
      networksMeta: { ethereum: { 137: { nativeCurrency: { symbol: 'MATIC' } } } },
      origins: { 'test-origin': { name: 'Test Dapp' } },
      signers: {},
      tokens: { byId: {}, accountTokenIds: {} },
      windows: { panel: { nav: [] } }
    })
    const req = {
      handlerId: 'test-req',
      type: 'transaction',
      origin: 'test-origin',
      account: senderAddress,
      data: {
        chainId: '0x89',
        from: senderAddress,
        to: tokenAddress,
        gasLimit: '0x5208',
        gasPrice: '0x3b9aca00',
        type: '0x0'
      },
      recognizedActions: [
        {
          id: 'erc20:transfer',
          data: {
            amount: '0x17d7840',
            decimals: 6,
            name: 'USD Coin',
            symbol: 'USDC',
            recipient: { address: recipientAddress, ens: 'recipient.eth' }
          }
        }
      ],
      decodedData: {
        method: 'transfer',
        signature: 'transfer(address,uint256)',
        args: []
      },
      classification: TxClassification.CONTRACT_CALL
    } satisfies TransactionRequestFixture

    renderRequest(req)

    const summary = screen.getByLabelText('Request summary')
    expect(summary.textContent).toMatch(/Test Dapp/i)
    expect(summary.textContent).not.toMatch(/Polygon/i)
    expect(screen.getByLabelText('Transaction effects').textContent).toMatch(/Estimated changes.*Polygon/i)
    expect(screen.queryByText('Send USDC')).toBeNull()

    const details = screen.getByLabelText('Transaction details')
    expect(details.textContent).toMatch(/recipient\.eth/i)
    expect(details.textContent).not.toMatch(/origin|chain|signer|from|contract|decode source/i)

    const recipientCopy = screen.getByRole('button', { name: 'Copy address for recipient.eth' })
    expect(screen.getAllByText('recipient.eth').length).toBeGreaterThan(0)
    expect(screen.getByText(shortAddress(recipientAddress))).toBeTruthy()
    fireEvent.click(recipientCopy)
    expect(capabilities.external.writeText).toHaveBeenCalledWith(recipientAddress)
    expect(screen.getByRole('button', { name: 'Address copied for recipient.eth' })).toBeTruthy()

    expect(screen.getByRole('button', { name: 'Copy address for testname' })).toBeTruthy()
    expect(screen.getByText('testname')).toBeTruthy()
    expect(screen.getByText(shortAddress(senderAddress))).toBeTruthy()
    expect(screen.queryByText(/hot signer/i)).toBeNull()
  })

  it('renders the full token symbol in the fallback asset icon', () => {
    const req = {
      handlerId: 'test-req',
      type: 'transaction',
      origin: 'test-origin',
      data: {
        chainId: '0x89',
        gasLimit: '0x5208',
        gasPrice: '0x3b9aca00',
        type: '0x0'
      },
      simulation: {
        status: 'success',
        effects: [
          {
            id: 'sim-usdc-out',
            kind: 'erc20',
            direction: 'out',
            label: 'Asset out',
            detail: 'Simulated balance change',
            amount: '0x17d7840',
            decimals: 6,
            symbol: 'USDC',
            assetAddress: '0x0000000000000000000000000000000000000001'
          }
        ]
      },
      classification: TxClassification.CONTRACT_CALL
    } satisfies TransactionRequestFixture

    renderRequest(req)

    const effects = screen.getByLabelText('Transaction effects')
    expect(within(effects).getAllByText('USDC')[0]?.textContent).toBe('USDC')
  })

  it('styles transaction effect icons by asset direction', () => {
    const req = {
      handlerId: 'test-req',
      type: 'transaction',
      origin: 'test-origin',
      data: {
        chainId: '0x89',
        gasLimit: '0x5208',
        gasPrice: '0x3b9aca00',
        type: '0x0'
      },
      simulation: {
        status: 'success',
        effects: [
          {
            id: 'sim-usdc-out',
            kind: 'erc20',
            direction: 'out',
            label: 'Asset out',
            amount: '0x1',
            decimals: 6,
            symbol: 'USDC'
          },
          {
            id: 'sim-weth-in',
            kind: 'erc20',
            direction: 'in',
            label: 'Asset in',
            amount: '0x1',
            decimals: 18,
            symbol: 'WETH'
          }
        ]
      },
      classification: TxClassification.CONTRACT_CALL
    } satisfies TransactionRequestFixture

    renderRequest(req)
    const outgoing = screen.getByRole('group', { name: 'Outgoing asset effect' })
    const incoming = screen.getByRole('group', { name: 'Incoming asset effect' })

    expect(outgoing).toBeTruthy()
    expect(incoming).toBeTruthy()
    expect(outgoing.getAttribute('data-effect-direction')).toBe('out')
    expect(incoming.getAttribute('data-effect-direction')).toBe('in')
    expect(within(outgoing).getByTestId('asset-icon').getAttribute('data-effect-icon-direction')).toBe(
      'neutral'
    )
    expect(within(incoming).getByTestId('asset-icon').getAttribute('data-effect-icon-direction')).toBe(
      'neutral'
    )
    expect(outgoing.textContent).toMatch(/-/)
    expect(incoming.textContent).toMatch(/\+/)
  })

  it('uses the canonical persisted token image for simulated effects', () => {
    const address = '0x0000000000000000000000000000000000000001'
    fixture.state.reset({
      assetRates: {},
      networks: { ethereum: { 137: { name: 'Polygon', isTestnet: false } } },
      networksMeta: { ethereum: { 137: { nativeCurrency: { symbol: 'MATIC' } } } },
      origins: { 'test-origin': { name: 'Test Dapp' } },
      tokens: {
        byId: {
          [`137:${address}`]: {
            address,
            chainId: 137,
            decimals: 6,
            name: 'USD Coin',
            symbol: 'USDC',
            custom: false,
            curated: true,
            sources: ['bundled'],
            updatedAt: 0,
            image: {
              base64: 'dG9rZW4taWNvbg==',
              contentHash: 'token-icon',
              mimeType: 'image/png'
            }
          }
        },
        accountTokenIds: {}
      },
      windows: { panel: { nav: [] } }
    })
    const req = {
      handlerId: 'test-req',
      type: 'transaction',
      origin: 'test-origin',
      data: {
        chainId: '0x89',
        gasLimit: '0x5208',
        gasPrice: '0x3b9aca00',
        type: '0x0'
      },
      simulation: {
        status: 'success',
        effects: [
          {
            id: 'sim-usdc-out',
            kind: 'erc20',
            direction: 'out',
            label: 'Asset out',
            amount: '0x1',
            decimals: 6,
            symbol: 'USDC',
            assetAddress: address
          }
        ]
      },
      classification: TxClassification.CONTRACT_CALL
    } satisfies TransactionRequestFixture

    renderRequest(req)

    expect(
      within(screen.getByLabelText('Transaction effects'))
        .getByRole('img', { name: 'USDC token' })
        .getAttribute('src')
    ).toBe('data:image/png;base64,dG9rZW4taWNvbg==')
  })

  it('renders fee rate presets for unsigned transactions', () => {
    const req = {
      handlerId: 'test-req',
      type: 'transaction',
      origin: 'test-origin',
      data: {
        chainId: '0x89',
        gasLimit: '0x5208',
        gasPrice: '0x3b9aca00',
        type: '0x0'
      },
      classification: TxClassification.CONTRACT_CALL
    } satisfies TransactionRequestFixture

    renderRequest(req)

    fireEvent.click(screen.getByRole('button', { name: /show gas fee settings/i }))
    const feeRate = screen.getByLabelText('Fee rate')
    expect(feeRate.textContent).toMatch(/very fast/i)
    expect(feeRate.textContent).toMatch(/fast/i)
    expect(feeRate.textContent).toMatch(/standard/i)
    expect(feeRate.textContent).toMatch(/slow/i)
    expect(feeRate.textContent).toMatch(/custom/i)

    fireEvent.click(screen.getByRole('button', { name: 'Fast' }))
    expect(capabilities.transaction.setDefaultFee).toHaveBeenCalledWith({
      requestId: 'test-req',
      level: 'fast'
    })

    fireEvent.click(screen.getByRole('button', { name: /show gas fee settings/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Custom' }))
    expect(screen.getByLabelText('Gas Price (GWEI)')).toBeTruthy()
  })

  it('reveals full calldata inline without opening a raw transaction view', () => {
    const req = {
      handlerId: 'test-req',
      type: 'transaction',
      origin: 'test-origin',
      data: {
        chainId: '0x89',
        data: '0x1234',
        calldataDigest: '0xabcdef',
        gasLimit: '0x5208',
        gasPrice: '0x3b9aca00',
        type: '0x0'
      },
      classification: TxClassification.CONTRACT_CALL
    } satisfies TransactionRequestFixture
    renderRequest(req)

    expect(screen.queryByText('Full calldata')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /calldata digest 0xabcdef/i }))
    expect(screen.getByText('Full calldata')).toBeTruthy()
    expect(screen.getByText('0x1234')).toBeTruthy()
    expect(screen.queryByText('Raw Transaction')).toBeNull()
  })

  it('updates recognized token approvals through the typed command', () => {
    const spender = '0x9bc5baf874d2da8d216ae9f137804184ee5afef4'
    const contract = '0x1eba19f260421142AD9Bf5ba193f6d4A0825e698'
    const requestedAmount = 70_000n
    const req: TransactionRequestView = {
      handlerId: 'test-req',
      type: 'transaction',
      account: '0x0000000000000000000000000000000000000001',
      origin: 'test-origin',
      payload: {
        id: 1,
        jsonrpc: '2.0',
        method: 'eth_sendTransaction',
        _origin: 'test-origin',
        params: [
          {
            chainId: '0x1',
            data: erc20Interface.encodeFunctionData('approve', [spender, requestedAmount])
          }
        ]
      },
      data: {
        chainId: '0x1',
        gasFeesSource: 'Dapp',
        type: '0x2'
      },
      classification: TxClassification.CONTRACT_CALL,
      feesUpdatedByUser: false,
      recipientType: 'contract',
      recognizedActions: [
        {
          id: 'erc20:approve',
          data: {
            amount: requestedAmount.toString(),
            decimals: 4,
            name: 'Test Token',
            symbol: 'TST',
            spender: { address: spender },
            contract: { address: contract }
          }
        }
      ]
    }

    render(
      <TransactionRequest
        actionId='erc20:approve'
        capabilities={capabilities}
        req={req}
        step='adjustApproval'
      />
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Unlimited' }))

    expect(capabilities.review.updateTokenApproval).toHaveBeenCalledWith({
      requestKind: 'transaction',
      requestId: 'test-req',
      actionId: 'erc20:approve',
      amount: expect.any(String)
    })
  })
})
