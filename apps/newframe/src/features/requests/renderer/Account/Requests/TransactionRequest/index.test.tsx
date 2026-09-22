import { beforeEach, describe, expect, it } from 'bun:test'

import { act, waitFor, within } from '@testing-library/react'

import { fireEvent, screen, render } from '../../../../../../../test/support/componentSetup'
import { registerTestRuntimeFixture } from '../../../../../../../test/support/rendererClient'
import { erc20Interface } from '../../../../../../shared/domain/evm'
import { TransactionApprovalAdjustmentsSchema } from '../../../../../transactions/domain/approval'
import { RequestStatus, TxClassification } from '../../../../contract/requests'
import {
  createRequestRendererCapabilitiesFake as createRequestPortsFake,
  type RequestRendererCapabilitiesFake
} from '../../../requestCapabilities.test-support'
import { RequestViewProvider } from '../../../requestView'
import type { TransactionRequestView } from '../requestViewTypes'
import TxRequest, { TransactionRequest } from './index'

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
    accounts: {},
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
    tokens: { byId: {}, accountTokenIds: {} },
    windows: {
      panel: { nav: [] }
    }
  })
})

function safeRequestFixture() {
  const safe = `0x${'1'.repeat(40)}`
  const owner = `0x${'2'.repeat(40)}`
  const recipient = `0x${'3'.repeat(40)}`
  const safeTxHash = `0x${'a'.repeat(64)}`
  const candidate = {
    accountId: owner,
    name: 'Local owner',
    address: owner,
    created: 'owner:1',
    signerType: 'seed',
    signerAttached: true,
    signerStatus: 'ok',
    status: 'ready' as const
  }
  const proposal = {
    safeTxHash,
    safe,
    nonce: '0',
    to: recipient,
    value: '0',
    operation: 0 as const,
    data: '0x',
    confirmations: [owner],
    safeTxGas: '0',
    baseGas: '0',
    gasPrice: '0',
    gasToken: '0x0000000000000000000000000000000000000000',
    refundReceiver: '0x0000000000000000000000000000000000000000',
    integrity: { status: 'matched' as const, reason: 'Hash matches.' },
    local: {
      createdAt: 1,
      confirmations: [],
      publication: { status: 'local' as const },
      execution: {
        status: 'ready' as const,
        executorId: owner,
        transaction: {
          chainId: '0x89',
          type: '0x2',
          gasFeesSource: 'Frame' as const,
          from: owner,
          to: safe,
          value: '0x0',
          data: '0x1234',
          nonce: '0x4',
          gasLimit: '0x5208',
          maxFeePerGas: '0x77359400',
          maxPriorityFeePerGas: '0x3b9aca00'
        }
      }
    }
  }
  fixture.state.reset({
    accounts: {
      [safe]: {
        id: safe,
        address: safe,
        name: 'Team Safe',
        signer: 'watch',
        requests: {},
        safe: {
          '137': {
            chainId: 137,
            address: safe,
            configuration: { owners: [owner], threshold: 1, nonce: '0' },
            pending: [proposal]
          }
        }
      }
    },
    assetRates: {},
    networks: { ethereum: { 137: { name: 'Polygon', isTestnet: false } } },
    networksMeta: { ethereum: { 137: { nativeCurrency: { symbol: 'MATIC', decimals: 18 } } } },
    origins: { 'test-origin': { name: 'Test Dapp' } },
    tokens: { byId: {}, accountTokenIds: {} },
    windows: { panel: { nav: [] } }
  })
  capabilities.safe.simulate.mockResolvedValue({
    status: 'unavailable',
    error: 'Trace unavailable'
  })
  const req = {
    handlerId: 'safe-request',
    type: 'transaction',
    origin: 'test-origin',
    account: safe,
    safeTxHash,
    safeTransactionProgress: {
      status: 'ready',
      chainId: 137,
      threshold: 1,
      confirmations: [owner],
      publication: 'local',
      ownerCandidates: [candidate],
      executorCandidates: [candidate]
    },
    data: { chainId: '0x89', from: safe, to: recipient, value: '0x0', data: '0x' },
    classification: TxClassification.NATIVE_TRANSFER
  } satisfies TransactionRequestFixture
  return { req, safe, owner }
}

describe('confirm', () => {
  it.each(['EOA', 'Safe'] as const)(
    'reviews a native %s transfer with the dapp origin and shared transaction details',
    async (accountType) => {
      const { req, safe, owner } = safeRequestFixture()
      const recipient = `0x${'3'.repeat(40)}`
      const prepared = structuredClone(fixture.state.wallet.getState())
      const proposal = prepared.accounts[safe].safe!['137'].pending![0]
      proposal.value = '1500000000000000000'
      fixture.state.reset(prepared)
      const nativeTransfer = {
        ...req,
        account: accountType === 'Safe' ? safe : owner,
        safeTxHash: accountType === 'Safe' ? req.safeTxHash : undefined,
        safeTransactionProgress: accountType === 'Safe' ? req.safeTransactionProgress : undefined,
        data: {
          chainId: '0x89',
          from: accountType === 'Safe' ? safe : owner,
          to: accountType === 'Safe' ? owner : recipient,
          value: accountType === 'Safe' ? '0x1' : '0x14d1120d7b160000',
          data: '0x'
        }
      } satisfies TransactionRequestFixture

      renderRequest(nativeTransfer)

      if (accountType === 'Safe') {
        await waitFor(() =>
          expect(screen.getByLabelText('Transaction effects').textContent).toContain('Trace unavailable')
        )
      }
      expect(screen.getByLabelText('Request summary').textContent).toContain('Test Dapp')
      expect(screen.queryByText('Safe proposal')).toBeNull()
      const details = screen.getByLabelText('Transaction details')
      expect(details.textContent).toMatch(/Send 1\.5 MATIC.*To.*0x333333/)
      expect(details.textContent).not.toContain('0x1234')
      expect(screen.queryByRole('button', { name: /calldata digest/i })).toBeNull()
      if (accountType === 'Safe') {
        expect(screen.queryByLabelText('Reviewed executor transaction')).toBeNull()
        expect(screen.getByRole('button', { name: 'Execution details' })).toBeTruthy()
      }
    }
  )

  it('uses the ordinary call details for verified Safe decoding instead of service or RPC descriptions', async () => {
    const { req, safe, owner } = safeRequestFixture()
    const calldata = '0x60fe47b1000000000000000000000000000000000000000000000000000000000000002a'
    const args = [{ name: 'newValue', type: 'uint256', value: '42' }]
    const prepared = structuredClone(fixture.state.wallet.getState())
    const proposal = prepared.accounts[safe].safe!['137'].pending![0]
    proposal.value = '1000000000000000000'
    proposal.data = calldata
    proposal.localDecoded = { method: 'setValue', parameters: args, source: 'Function selector registry' }
    proposal.dataDecoded = { method: 'forgedService', parameters: [] }
    fixture.state.reset(prepared)
    const ordinary = {
      ...req,
      account: owner,
      safeTxHash: undefined,
      safeTransactionProgress: undefined,
      classification: TxClassification.CONTRACT_CALL,
      data: { chainId: '0x89', from: owner, to: proposal.to, value: '0xde0b6b3a7640000', data: calldata },
      decodedData: { method: 'setValue', signature: 'setValue(uint256)', args }
    } satisfies TransactionRequestFixture
    const { unmount } = renderRequest(ordinary)
    const ordinaryDetails = screen.getByLabelText('Transaction details').textContent
    expect(ordinaryDetails).toMatch(/Call setValue.*newValue \(uint256\).*42.*Attached value.*1.0 MATIC/)
    unmount()

    renderRequest({
      ...req,
      classification: TxClassification.CONTRACT_CALL,
      decodedData: { method: 'forgedRPC', signature: 'forgedRPC()', args: [] }
    })

    await waitFor(() =>
      expect(screen.getByLabelText('Transaction effects').textContent).toContain('Trace unavailable')
    )
    expect(screen.getByLabelText('Transaction details').textContent).toBe(ordinaryDetails)
    expect(screen.queryByText(/forgedService|forgedRPC/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Show full calldata/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Copy full calldata' }))
    expect(capabilities.external.writeText).toHaveBeenCalledWith(calldata)
  })

  it('moves one owner approval through reviewed execution and submitted state', async () => {
    const { req, safe, owner } = safeRequestFixture()
    const collecting = structuredClone(fixture.state.wallet.getState())
    const proposal = collecting.accounts[safe].safe!['137'].pending![0]
    const reviewedTransaction = structuredClone(proposal.local!.execution.transaction!)
    proposal.confirmations = []
    proposal.local!.execution = { status: 'idle' }
    fixture.state.reset(collecting)
    const collectingRequest = {
      ...req,
      safeTransactionProgress: {
        ...req.safeTransactionProgress,
        status: 'collecting' as const,
        confirmations: []
      }
    }
    const view = (request: TransactionRequestFixture) => (
      <RequestViewProvider>
        <TxRequest capabilities={capabilities} req={completeRequest(request)} />
      </RequestViewProvider>
    )
    const { rerender, user } = render(view(collectingRequest))

    expect(await screen.findByText('Pending proposal')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Execute transaction' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Sign' }))
    expect(capabilities.review.approve).toHaveBeenCalledWith({ requestId: req.handlerId, ownerId: owner })
    expect(capabilities.review.approve).toHaveBeenCalledTimes(1)
    expect(capabilities.safe.prepareExecution).not.toHaveBeenCalled()

    const thresholdComplete = structuredClone(collecting)
    thresholdComplete.accounts[safe].safe!['137'].pending![0].confirmations = [owner]
    const awaitingMain = {
      ...collectingRequest,
      safeTransactionProgress: { ...collectingRequest.safeTransactionProgress, confirmations: [owner] }
    }
    await act(async () => fixture.state.reset(thresholdComplete))
    rerender(view(awaitingMain))
    expect(await screen.findByText('Pending proposal')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Execute transaction' })).toBeNull()
    expect(capabilities.safe.prepareExecution).not.toHaveBeenCalled()

    const ready = structuredClone(thresholdComplete)
    const readyProposal = ready.accounts[safe].safe!['137'].pending![0]
    readyProposal.local!.execution = {
      status: 'ready',
      executorId: owner,
      transaction: reviewedTransaction
    }
    await act(async () => fixture.state.reset(ready))
    rerender(view(req))

    expect(await screen.findByText('Ready · awaiting execution')).toBeTruthy()
    expect(screen.getByText('Gas-paying executor')).toBeTruthy()
    expect(capabilities.review.approve).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'Show gas fee settings' }))
    await user.click(screen.getByRole('button', { name: 'Custom' }))
    fireEvent.change(screen.getByLabelText('Gas Limit (UNITS)'), { target: { value: '22000' } })
    fireEvent.change(screen.getByLabelText('Base Fee (GWEI)'), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText('Max Priority Fee (GWEI)'), { target: { value: '2' } })
    expect(screen.getByLabelText('Network fee').textContent).toContain('5 Gwei')
    await user.click(screen.getByRole('button', { name: 'Execute transaction' }))

    const approval = capabilities.review.approve.mock.calls[1][0]
    const adjustments = 'adjustments' in approval ? approval.adjustments : undefined
    expect(TransactionApprovalAdjustmentsSchema.safeParse(adjustments).success).toBe(true)
    expect(approval).toEqual({
      requestId: req.handlerId,
      executorId: owner,
      adjustments: {
        gasLimit: '0x55f0',
        maxFeePerGas: '0x12a05f200',
        maxPriorityFeePerGas: '0x77359400'
      }
    })

    const outerTxHash = `0x${'d'.repeat(64)}`
    const submitted = structuredClone(ready)
    submitted.accounts[safe].safe!['137'].pending![0].local!.execution = {
      status: 'submitted',
      executorId: owner,
      transaction: { ...reviewedTransaction, ...adjustments },
      transactionHash: outerTxHash
    }
    const submittedRequest = {
      ...req,
      safeTransactionProgress: { ...req.safeTransactionProgress, status: 'submitted' as const }
    }
    await act(async () => fixture.state.reset(submitted))
    rerender(view(submittedRequest))

    expect(await screen.findByText('Submitted')).toBeTruthy()
    expect(screen.getByText(outerTxHash)).toBeTruthy()
    expect(screen.getByLabelText('Network fee').textContent).toContain('5 Gwei')
    expect(screen.queryByRole('button', { name: 'Custom' })).toBeNull()
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Transaction submitted' }).disabled).toBe(
      true
    )
    expect(screen.queryByRole('button', { name: 'Execute transaction' })).toBeNull()
  })

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
    fireEvent.click(screen.getByRole('button', { name: 'Copy transaction hash' }))
    expect(capabilities.external.writeText).toHaveBeenCalledWith(req.tx.hash)
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
        },
        recipient: {
          id: 'recipient',
          address: recipientAddress.toUpperCase(),
          name: 'Recipient Ledger',
          lastSignerType: 'ledger',
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
      tokenData: { name: 'USD Coin', symbol: 'USDC', decimals: 6 },
      recognizedActions: [
        {
          id: 'erc20:transfer',
          data: {
            amount: '0x17d7840',
            decimals: 18,
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
    expect(screen.getByText('Send USDC')).toBeTruthy()
    expect(screen.getByText('25.0 USDC')).toBeTruthy()
    expect(within(screen.getByLabelText('Transaction effects')).getByText('25')).toBeTruthy()

    const details = screen.getByLabelText('Transaction details')
    expect(details.textContent).toMatch(/recipient\.eth/i)
    expect(details.textContent).toMatch(/Token contract.*USD Coin/i)
    expect(details.textContent).not.toMatch(/origin|chain|signer|from|decode source/i)

    const recipientCopy = screen.getByRole('button', { name: 'Copy address for recipient.eth' })
    const addressImages = within(details).getAllByRole('presentation', { hidden: true })
    expect(addressImages).toHaveLength(2)
    for (const image of addressImages) {
      expect(image.getAttribute('src')).toStartWith('data:image/png;base64,')
    }
    expect(details.innerHTML).toContain('viewBox="0 0 400 400"')
    expect(details.innerHTML.match(/<svg /g)).toHaveLength(3) // Ledger badge and two copy controls.
    expect(screen.getAllByText('recipient.eth').length).toBeGreaterThan(0)
    expect(screen.getByText(recipientAddress)).toBeTruthy()
    fireEvent.click(recipientCopy)
    expect(capabilities.external.writeText).toHaveBeenCalledWith(recipientAddress)
    expect(screen.getByRole('button', { name: 'Address copied for recipient.eth' })).toBeTruthy()

    expect(summary.textContent).not.toContain('testname')
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
      accounts: {},
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
    expect(capabilities.transaction.setFeePreference).toHaveBeenCalledWith({
      chainId: 137,
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
    expect(screen.getAllByText('0x1234')).toHaveLength(2)
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
        onUpdateFee={() => {}}
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
      amount: expect.any(String) as unknown
    })
  })
})

it('keeps a single named argument visible and separates calldata verification from transaction hashes', () => {
  const calldata = '0x60fe47b1000000000000000000000000000000000000000000000000000000000000002a'
  const req = {
    handlerId: 'named-arg',
    type: 'transaction',
    origin: 'test-origin',
    data: {
      chainId: '0x89',
      to: '0x0000000000000000000000000000000000000010',
      value: '0xde0b6b3a7640000',
      data: calldata,
      calldataDigest: '0xdigest'
    },
    decodedData: {
      method: 'setValue',
      signature: 'setValue(uint256)',
      source: 'Function selector registry',
      contractName: 'Storage',
      args: [{ name: 'newValue', type: 'uint256', value: '42' }]
    },
    classification: TxClassification.CONTRACT_CALL
  } satisfies TransactionRequestFixture
  renderRequest(req)
  const details = screen.getByLabelText('Transaction details')
  expect(details.textContent).toMatch(
    /Call setValue.*On contract.*Storage.*newValue \(uint256\).*42.*Attached value.*1.0 MATIC/
  )
  expect(
    screen.getByLabelText('Transaction effects').compareDocumentPosition(details) &
      Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy()
  expect(screen.queryByText('ABI source')).toBeNull()
  expect(screen.queryByText('Transaction hash')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Copy calldata digest' }))
  expect(capabilities.external.writeText).toHaveBeenCalledWith('0xdigest')
  fireEvent.click(screen.getByRole('button', { name: /Show full calldata/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Copy full calldata' }))
  expect(capabilities.external.writeText).toHaveBeenCalledWith(calldata)
  fireEvent.click(screen.getByRole('button', { name: 'Raw transaction' }))
  fireEvent.click(screen.getByRole('button', { name: 'Copy raw transaction' }))
  expect(capabilities.external.writeText).toHaveBeenCalledWith(
    JSON.stringify(completeRequest(req).data, null, 2)
  )
})

it('shows the approval spender separately from the token contract without inventing decimals', () => {
  const spender = '0x0000000000000000000000000000000000000011'
  const contract = '0x0000000000000000000000000000000000000022'
  renderRequest({
    handlerId: 'approval',
    type: 'transaction',
    origin: 'test-origin',
    data: { chainId: '0x89', to: contract },
    recognizedActions: [
      {
        id: 'erc20:approve',
        data: {
          amount: '0xf4240',
          symbol: 'USDC',
          name: 'USD Coin',
          spender: { address: spender, ens: 'spender.eth' },
          contract: { address: contract }
        }
      }
    ],
    classification: TxClassification.CONTRACT_CALL
  })
  const details = screen.getByLabelText('Transaction details')
  expect(details.textContent).toMatch(
    /Approve USDC.*Spender.*spender.eth.*Amount.*1000000 raw units.*Token contract.*USD Coin/
  )
  fireEvent.click(within(details).getByRole('button', { name: 'Copy address for spender.eth' }))
  expect(capabilities.external.writeText).toHaveBeenCalledWith(spender)
  fireEvent.click(within(details).getByRole('button', { name: 'Copy address for USD Coin' }))
  expect(capabilities.external.writeText).toHaveBeenCalledWith(contract)
})

it.each([
  {
    method: 'approve',
    signature: 'approve(address,uint256)',
    args: [{ name: 'tokenId', type: 'uint256', value: '42' }]
  },
  {
    method: 'transfer',
    signature: 'transfer(uint256)',
    args: [{ name: 'item', type: 'uint256', value: '42' }]
  }
])('treats $signature as a generic call despite token metadata', (decodedData) => {
  renderRequest({
    handlerId: 'generic',
    type: 'transaction',
    origin: 'test-origin',
    data: { chainId: '0x89', to: '0x0000000000000000000000000000000000000010' },
    decodedData: { ...decodedData, args: [...decodedData.args] },
    tokenData: { name: 'Example collection', symbol: 'NFT', decimals: 18 },
    classification: TxClassification.CONTRACT_CALL
  })
  expect(screen.getByLabelText('Transaction details').textContent).toMatch(
    new RegExp(`Call ${decodedData.method}.*On contract.*uint256.*42`)
  )
  expect(screen.queryByText('Spender')).toBeNull()
  expect(screen.queryByText('Token contract')).toBeNull()
  expect(screen.queryByText('Allowance change')).toBeNull()
})

it('shows unknown calldata and simulation failure even when value creates a visible effect', () => {
  renderRequest({
    handlerId: 'unknown',
    type: 'transaction',
    origin: 'test-origin',
    data: { chainId: '0x89', data: '0xdeadbeef1234', value: '0x1' },
    simulation: { status: 'error', error: 'RPC simulation failed' },
    classification: TxClassification.CONTRACT_CALL
  })
  expect(screen.getByText('Cannot decode calldata. Inspect the selector and raw bytes.')).toBeTruthy()
  expect(screen.getByText('0xdeadbeef')).toBeTruthy()
  expect(screen.getByRole('alert').textContent).toContain('RPC simulation failed')
})
