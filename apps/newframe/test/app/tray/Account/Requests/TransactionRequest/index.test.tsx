import Restore from 'react-restore'

import store from '../../../../../../main/store'
import { screen, render } from '../../../../../componentSetup'
import TxRequestComponent from '../../../../../../app/tray/Account/Requests/TransactionRequest'
import { TxClassification } from '../../../../../../main/accounts/types'
import { TRANSACTION_CONFIRMATION_TARGET } from '../../../../../../resources/domain/transaction'

const TxRequest = Restore.connect(TxRequestComponent, store)

const account = '0xDAFEA492D9c6733ae3d56b7Ed1ADB60692c98Bc5'

beforeEach(() => {
  store.__resetState()
  store.addNetwork({
    id: 137,
    type: 'ethereum',
    explorer: '',
    symbol: 'MATIC',
    name: 'Polygon'
  })
  store.initOrigin('test-origin', { name: 'Test Dapp' })
})

function addRequest(req: any) {
  store.updateAccount({
    id: account,
    name: 'Test Account',
    requests: {
      [req.handlerId]: req
    }
  })
}

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

    addRequest(req)

    render(<TxRequest req={req} step='confirm' />)

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

    addRequest(req)

    render(<TxRequest req={req} step='confirm' />)

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

    addRequest(req)

    render(<TxRequest req={req} step='confirm' />)

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

    addRequest(req)

    render(<TxRequest req={req} step='confirm' />)

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

    addRequest(req)

    render(<TxRequest req={req} step='confirm' />)

    const effects = screen.getByLabelText('Transaction effects')
    expect(effects.querySelector('.txReviewEffectIcon')?.textContent).toBe('USDC')
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

    addRequest(req)

    render(<TxRequest req={req} step='confirm' />)

    const feeRate = screen.getByLabelText('Fee rate')
    expect(feeRate.textContent).toMatch(/ape/i)
    expect(feeRate.textContent).toMatch(/fast/i)
    expect(feeRate.textContent).toMatch(/medium/i)
    expect(feeRate.textContent).toMatch(/slow/i)
    expect(feeRate.textContent).toMatch(/custom/i)
  })
})
