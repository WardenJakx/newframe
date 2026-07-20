import { fireEvent, screen, render } from '../../../../../componentSetup'
import { within } from '@testing-library/react'
import TxRequest, { TransactionRequest } from '../../../../../../app/tray/Account/Requests/TransactionRequest'
import { resetStateMirrorForTests } from '../../../../../../app/state/rendererStore'
import { RequestViewProvider } from '../../../../../../app/tray/requestView'
import { TxClassification } from '../../../../../../main/accounts/types'
import { erc20Interface } from '../../../../../../resources/contracts'
import { TRANSACTION_CONFIRMATION_TARGET } from '../../../../../../resources/domain/transaction'
import link from '../../../../../../resources/link'

const renderRequest = (req: any) =>
  render(
    <RequestViewProvider>
      <TxRequest req={req} />
    </RequestViewProvider>
  )

beforeEach(() => {
  resetStateMirrorForTests({
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
  it('renders a confirming transaction', () => {
    const req = {
      handlerId: 'test-req',
      type: 'transaction',
      status: 'confirming',
      origin: 'test-origin',
      data: {
        chainId: '0x89'
      },
      classification: TxClassification.NATIVE_TRANSFER
    }

    renderRequest(req)

    const notice = screen.getByRole('status')
    expect(notice.textContent).toBe('confirming')
  })

  it('renders a transaction notice', () => {
    const req = {
      handlerId: 'test-req',
      type: 'transaction',
      status: 'confirming',
      notice: 'insufficient funds for gas',
      origin: 'test-origin',
      recipientType: 'external',
      data: {
        chainId: '0x89'
      },
      classification: TxClassification.NATIVE_TRANSFER
    }

    renderRequest(req)

    const notice = screen.getByRole('alert')
    expect(notice.textContent).toMatch(/insufficient funds for gas/i)
  })

  it('renders deterministic native asset effects', () => {
    const req = {
      handlerId: 'test-req',
      type: 'transaction',
      origin: 'test-origin',
      data: {
        chainId: '0x89',
        value: '0x2386f26fc10000',
        gasLimit: '0x5208',
        gasPrice: '0x3b9aca00',
        type: '0x0'
      },
      classification: TxClassification.NATIVE_TRANSFER
    }

    renderRequest(req)

    const effects = screen.getByLabelText('Transaction effects')
    expect(effects.textContent).toMatch(/asset out/i)
    expect(effects.textContent).toMatch(/matic/i)
  })

  it('renders vertical progress and compact fee regions', () => {
    const req = {
      handlerId: 'test-req',
      type: 'transaction',
      status: 'confirming',
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
    }

    renderRequest(req)

    expect(screen.getByLabelText('Transaction progress').textContent).toMatch(/submitted/i)
    expect(screen.getByLabelText('Transaction progress').textContent).toMatch(
      `1/${TRANSACTION_CONFIRMATION_TARGET} confirmations`
    )
    expect(screen.getByLabelText('Network fee').textContent).toMatch(/max fee/i)
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
    }

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
    }

    renderRequest(req)
    const outgoing = screen.getByRole('group', { name: 'Outgoing asset effect' })
    const incoming = screen.getByRole('group', { name: 'Incoming asset effect' })

    expect(outgoing).toBeTruthy()
    expect(incoming).toBeTruthy()
    expect(outgoing.getAttribute('data-effect-direction')).toBe('out')
    expect(incoming.getAttribute('data-effect-direction')).toBe('in')
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
    }

    renderRequest(req)

    const feeRate = screen.getByLabelText('Fee rate')
    expect(feeRate.textContent).toMatch(/ape/i)
    expect(feeRate.textContent).toMatch(/fast/i)
    expect(feeRate.textContent).toMatch(/medium/i)
    expect(feeRate.textContent).toMatch(/slow/i)
    expect(feeRate.textContent).toMatch(/custom/i)

    fireEvent.click(screen.getByRole('button', { name: 'Fast' }))
    expect(link.executeCommand).toHaveBeenCalledWith({
      type: 'transaction.fee-default-set',
      requestId: 'test-req',
      level: 'fast'
    })

    fireEvent.click(screen.getByRole('button', { name: 'Custom' }))
    expect(screen.getByLabelText('Gas Price (GWEI)')).toBeTruthy()
  })

  it('opens raw transaction data and sends typed nonce commands', () => {
    const req = {
      handlerId: 'test-req',
      type: 'transaction',
      origin: 'test-origin',
      payload: { nonce: '0x1' },
      data: {
        chainId: '0x89',
        nonce: '0x2',
        data: '0x1234',
        gasLimit: '0x5208',
        gasPrice: '0x3b9aca00',
        type: '0x0'
      },
      classification: TxClassification.CONTRACT_CALL
    }
    renderRequest(req)

    fireEvent.click(screen.getByText('View data'))
    fireEvent.click(screen.getByRole('button', { name: 'Lower nonce' }))
    fireEvent.click(screen.getByRole('button', { name: 'Raise nonce' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reset nonce' }))

    expect(link.executeCommand).toHaveBeenCalledWith({
      type: 'transaction.nonce-adjust',
      requestId: 'test-req',
      direction: -1
    })
    expect(link.executeCommand).toHaveBeenCalledWith({
      type: 'transaction.nonce-adjust',
      requestId: 'test-req',
      direction: 1
    })
    expect(link.executeCommand).toHaveBeenCalledWith({
      type: 'transaction.nonce-reset',
      requestId: 'test-req'
    })
  })

  it('updates recognized token approvals through the typed command', () => {
    const spender = '0x9bc5baf874d2da8d216ae9f137804184ee5afef4'
    const contract = '0x1eba19f260421142AD9Bf5ba193f6d4A0825e698'
    const requestedAmount = 70_000n
    const req = {
      handlerId: 'test-req',
      type: 'transaction',
      payload: {
        params: [
          {
            data: erc20Interface.encodeFunctionData('approve', [spender, requestedAmount])
          }
        ]
      },
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

    render(<TransactionRequest req={req} step='adjustApproval' actionId='erc20:approve' />)
    fireEvent.click(screen.getByRole('tab', { name: 'Unlimited' }))

    expect(link.executeCommand).toHaveBeenCalledWith({
      type: 'request.token-approval-update',
      requestKind: 'transaction',
      requestId: 'test-req',
      actionId: 'erc20:approve',
      amount: expect.any(String)
    })
  })
})
