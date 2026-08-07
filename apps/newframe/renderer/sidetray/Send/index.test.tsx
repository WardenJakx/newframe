import { beforeEach, describe, expect, it } from 'bun:test'
import type { Mock } from 'bun:test'

import { act, fireEvent, render, screen, waitFor } from '../../../test/support/componentSetup'
import Send from './index'
import { applyStateMessage, beginStateConnection, resetStateMirrorForTests } from '../../state/rendererStore'
import { NATIVE_CURRENCY } from '../../../domain/token/constants'
import { createHostFixture } from '../../../test/support/rendererClient'
import { STATE_STREAM_SCHEMA_VERSION } from '../../../contracts/state/protocol'
import { shortAddress } from '../../shared/ui/AddressIdentity'

const link = createHostFixture()

const sender = {
  id: 'sender',
  address: '0x0000000000000000000000000000000000000001',
  name: 'Sender',
  lastSignerType: 'address'
}
const recipient = {
  id: 'recipient',
  address: '0x0000000000000000000000000000000000000002',
  name: 'Recipient',
  lastSignerType: 'ledger'
}
const chainId = 31337
const tokenAddress = '0x00000000000000000000000000000000000000bb'
const nativeAssetId = `${chainId}:${NATIVE_CURRENCY}`
let stateRevision = 0

function updateSendState(changes: Record<string, unknown>) {
  const baseRevision = stateRevision
  stateRevision += 1
  return applyStateMessage({
    schemaVersion: STATE_STREAM_SCHEMA_VERSION,
    streamId: 'send-test',
    baseRevision,
    revision: stateRevision,
    changes
  })
}

function initializeSendState(balances: any[] = [nativeBalance()], customTokens: any[] = []) {
  const tokenRecords = [...balances, ...customTokens]
    .filter((token) => token.address !== NATIVE_CURRENCY && token.name && token.symbol)
    .map((token) => ({
      ...token,
      custom: customTokens.includes(token),
      curated: false,
      sources: customTokens.includes(token) ? ['custom'] : ['onchain'],
      updatedAt: 0
    }))
  resetStateMirrorForTests()
  stateRevision = 0
  beginStateConnection('sidetray')
  applyStateMessage({
    schemaVersion: STATE_STREAM_SCHEMA_VERSION,
    streamId: 'send-test',
    revision: 0,
    state: {
      currentAccount: sender.id,
      accounts: {
        [sender.id]: sender,
        [recipient.id]: recipient
      },
      accountOrder: [recipient.id, sender.id],
      activity: {},
      operations: {},
      balances: {
        [sender.address]: balances,
        [recipient.address]: balances
      },
      networks: {
        ethereum: {
          [chainId]: {
            id: chainId,
            explorer: '',
            isTestnet: true,
            name: 'Local',
            on: true
          }
        }
      },
      networksMeta: {
        ethereum: {
          [chainId]: {
            nativeCurrency: {
              symbol: 'ETH',
              name: 'Ether',
              decimals: 18
            },
            primaryColor: 'accent1'
          }
        }
      },
      assetRates: {
        [`${chainId}:${tokenAddress}`]: {
          usdRate: 2,
          source: 'zerion',
          observedAt: 1
        }
      },
      runtime: {
        profile: 'dev',
        isDev: true,
        environment: 'test'
      },
      tokens: {
        byId: Object.fromEntries(
          tokenRecords.map((token) => [
            `${token.chainId}:${token.address.toLowerCase()}`,
            { ...token, address: token.address.toLowerCase() }
          ])
        ),
        accountTokenIds: {
          [sender.address]: tokenRecords.map((token) => `${token.chainId}:${token.address.toLowerCase()}`)
        }
      }
    }
  })
}

function nativeBalance() {
  return {
    address: NATIVE_CURRENCY,
    balance: '0xde0b6b3a7640000',
    chainId,
    decimals: 18,
    displayBalance: '',
    name: 'Ether',
    symbol: 'ETH'
  }
}

function tokenBalance() {
  return {
    address: tokenAddress,
    balance: '2000000',
    chainId,
    decimals: 6,
    displayBalance: '',
    name: 'USD Coin',
    symbol: 'USDC'
  }
}

describe('Send', () => {
  beforeEach(() => {
    initializeSendState()
  })

  it('renders an empty state when there are no sendable assets', () => {
    initializeSendState([])

    render(<Send />)

    expect(screen.getByText('No assets available to send.')).toBeTruthy()
  })

  it('falls back when the route asset is not sendable', () => {
    render(<Send assetId={`${chainId}:${tokenAddress}`} />)

    expect(screen.getByRole('button', { name: 'Select send token' }).textContent).toContain('ETH')
  })

  it('prefers the route asset when it is sendable', () => {
    initializeSendState([nativeBalance(), tokenBalance()])

    render(<Send assetId={`${chainId}:${tokenAddress}`} />)

    expect(screen.getByRole('button', { name: 'Select send token' }).textContent).toContain('USDC')
  })

  it('renders an unknown fiat value when the selected asset has no rate', () => {
    render(<Send assetId={nativeAssetId} />)

    expect(screen.getByText('—')).toBeTruthy()
    expect(screen.queryByText('$0.00')).toBeNull()
  })

  it('renders a fiat notional when the selected asset has a resolved rate', () => {
    initializeSendState([nativeBalance(), tokenBalance()])

    render(<Send assetId={`${chainId}:${tokenAddress}`} />)
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '2' } })

    expect(screen.getByText('$4.00')).toBeTruthy()
  })

  it('allows the send amount to be cleared and typed after selecting a recipient', async () => {
    const { user } = render(<Send assetId={nativeAssetId} />)
    await user.click(screen.getByText(shortAddress(recipient.address)))
    const amountInput = screen.getByLabelText('Amount') as HTMLInputElement

    expect(screen.getByText('Recipient')).toBeTruthy()
    expect(screen.getByText(shortAddress(recipient.address))).toBeTruthy()
    expect(screen.queryByText(recipient.address)).toBeNull()
    expect(screen.getByRole('button', { name: 'Copy address for Recipient' })).toBeTruthy()
    await user.clear(amountInput)
    await user.type(amountInput, '2.5')

    expect(amountInput.value).toBe('2.5')
  })

  it('searches and selects a custom token with no balance', async () => {
    const customToken = {
      address: '0x00000000000000000000000000000000000000cc',
      chainId,
      decimals: 6,
      name: 'Custom Dollar',
      symbol: 'CUSD'
    }
    initializeSendState([nativeBalance()], [customToken])

    const { user } = render(<Send assetId={nativeAssetId} />)
    await user.click(screen.getByRole('button', { name: 'Select send token' }))
    await user.type(screen.getByLabelText('Search tokens'), 'Custom Dollar')

    expect(screen.getAllByRole('option')).toHaveLength(1)
    await user.click(screen.getByRole('option'))

    expect(screen.getByRole('button', { name: 'Select send token' }).textContent).toContain('CUSD')
  })

  it('does not show the sending wallet as a recipient option', () => {
    render(<Send assetId={nativeAssetId} />)

    expect(screen.getByText('Recipient')).toBeTruthy()
    expect(screen.queryByText('Sender')).toBeNull()
    expect(screen.queryByText(sender.address)).toBeNull()
  })

  it('shows the first-time warning when the sender has no activity with the recipient', async () => {
    const { user } = render(<Send assetId={nativeAssetId} />)

    await user.click(screen.getByRole('button', { name: 'Select Recipient' }))

    expect(screen.getByText('First time sending to this address.')).toBeTruthy()
  })

  it('shows shortened recipient addresses and copies the full address from the wallet selector', async () => {
    const { user } = render(<Send assetId={nativeAssetId} />)

    expect(screen.getByText(shortAddress(recipient.address))).toBeTruthy()
    const copyButton = screen.getByRole('button', {
      name: `Copy address for ${shortAddress(recipient.address)}`
    })
    await user.click(copyButton)

    expect(link.executeCommand).toHaveBeenCalledWith({
      type: 'clipboard.write',
      text: recipient.address
    })
    expect(
      screen.getByRole('button', { name: `Address copied for ${shortAddress(recipient.address)}` })
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Select Recipient' })).toBeTruthy()
  })

  it('hides the first-time warning when activity contains a prior send to the recipient', async () => {
    updateSendState({
      activity: {
        prior: {
          id: 'prior',
          account: sender.address.toUpperCase(),
          status: 'succeeded',
          data: { to: recipient.address.toUpperCase() }
        }
      }
    })
    const { user } = render(<Send assetId={nativeAssetId} />)

    await user.click(screen.getByRole('button', { name: 'Select Recipient' }))

    expect(screen.queryByText('First time sending to this address.')).toBeNull()
  })

  it('clears recipient, amount, and open menus when the current account changes', async () => {
    const { user } = render(<Send assetId={nativeAssetId} />)
    await user.click(screen.getByRole('button', { name: 'Select Recipient' }))
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '4' } })
    await user.click(screen.getByRole('button', { name: 'Select send token' }))
    expect(screen.getByRole('listbox', { name: 'Select send token' })).toBeTruthy()

    act(() => {
      updateSendState({ currentAccount: recipient.id })
    })

    await waitFor(() => {
      expect((screen.getByLabelText('Amount') as HTMLInputElement).value).toBe('')
    })
    expect(screen.queryByRole('listbox', { name: 'Select send token' })).toBeNull()
    expect(screen.queryByText(recipient.address)).toBeNull()
    expect((screen.getByLabelText('Recipient') as HTMLInputElement).value).toBe('')
  })

  it('also resets when the current account is lost', async () => {
    render(<Send assetId={nativeAssetId} />)
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '4' } })

    act(() => {
      updateSendState({ currentAccount: '' })
    })

    await waitFor(() => {
      expect(screen.getByText('No assets available to send.')).toBeTruthy()
    })
  })

  it('ignores a submission result from the previously selected account', async () => {
    let resolveSubmission: (result: any) => void = () => undefined
    ;(link.executeCommand as Mock<any>).mockImplementation((command: any) => {
      if (command.type !== 'send.submit') return Promise.resolve({ ok: true })
      return new Promise((resolve) => {
        resolveSubmission = resolve
      })
    })

    const { user } = render(<Send assetId={nativeAssetId} />)
    await user.click(screen.getByRole('button', { name: 'Select Recipient' }))
    fireEvent.click(screen.getByRole('button', { name: 'Proceed' }))
    expect(screen.getByText('Confirm in Newframe')).toBeTruthy()

    await act(async () => {
      updateSendState({ currentAccount: recipient.id })
      resolveSubmission({ ok: false, error: 'operation_failed' })
      await Promise.resolve()
    })

    expect(screen.queryByText('Confirm in Newframe')).toBeNull()
    expect(screen.queryByText('Transaction submitted')).toBeNull()
  })

  it('submits a native transfer through the Send service flow', async () => {
    const { user } = render(<Send assetId={nativeAssetId} />)
    const recipientButton = screen.getByRole('button', { name: 'Select Recipient' })

    await user.click(recipientButton)

    const proceedButton = screen.getByRole('button', { name: 'Proceed' })
    expect(proceedButton.hasAttribute('disabled')).toBe(false)

    await user.click(proceedButton)

    const command = (link.executeCommand as Mock<any>).mock.calls.find(
      ([candidate]) => (candidate as { type?: string }).type === 'send.submit'
    )?.[0] as {
      type: 'send.submit'
      operationId: string
      asset: { address: string; chainId: number }
      amount: string
      recipient: string
    }
    expect(command).toEqual({
      type: 'send.submit',
      operationId: expect.any(String),
      asset: { address: NATIVE_CURRENCY, chainId },
      amount: '1000000000000000000',
      recipient: recipient.address
    })
    expect(screen.getByText('Confirm in Newframe')).toBeTruthy()

    const transactionHash = `0x${'1'.repeat(64)}`
    act(() => {
      updateSendState({
        operations: {
          [command.operationId]: {
            id: command.operationId,
            type: 'send.submit',
            status: 'succeeded',
            phase: 'submitted',
            entityRefs: [
              { type: 'account', id: sender.id },
              { type: 'transaction', id: transactionHash }
            ],
            startedAt: 1,
            updatedAt: 2,
            finishedAt: 2
          }
        }
      })
    })
    expect(screen.getByText('Confirm in Newframe')).toBeTruthy()
    act(() => {
      updateSendState({
        activity: {
          [transactionHash]: {
            id: transactionHash,
            hash: transactionHash,
            account: sender.address,
            status: 'submitted',
            data: { to: recipient.address }
          }
        }
      })
    })
    expect(await screen.findByText('Transaction submitted')).toBeTruthy()
  })

  it('keeps recipient resolution errors visible without sending a provider request', async () => {
    render(<Send assetId={nativeAssetId} />)

    fireEvent.change(screen.getByLabelText('Recipient'), {
      target: { value: 'unknown.eth' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Proceed' }))

    const command = (link.executeCommand as Mock<any>).mock.calls.find(
      ([candidate]) => (candidate as { type?: string }).type === 'send.submit'
    )?.[0] as { operationId: string }
    act(() => {
      updateSendState({
        operations: {
          [command.operationId]: {
            id: command.operationId,
            type: 'send.submit',
            status: 'failed',
            phase: 'failed',
            error: { code: 'recipient_not_found', message: 'Could not resolve recipient.' },
            startedAt: 1,
            updatedAt: 2,
            finishedAt: 2
          }
        }
      })
    })
    expect(await screen.findByText('Could not resolve recipient.')).toBeTruthy()
    expect((link.executeQuery as Mock<any>).mock.calls).toEqual([])
    expect(
      (link.executeCommand as Mock<any>).mock.calls.some(
        ([command]) => (command as { type?: string }).type === 'transaction.submit'
      )
    ).toBe(false)
  })
})
