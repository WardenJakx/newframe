import { beforeEach, describe, expect, it } from 'bun:test'

import { act, fireEvent, render, screen, waitFor } from '../../../../../test/support/componentSetup'
import Send from './index'
import { NATIVE_CURRENCY } from '../../../tokens/domain/constants'
import { registerTestRuntimeFixture } from '../../../../../test/support/rendererClient'
import { createSendCapabilityFake, type SendCapabilityFake } from './sendService.test-support'
import type { AppCommand, AppQuery, CommandResult } from '../../../../app/contracts/operations'

const fixture = registerTestRuntimeFixture()

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
const nativeAssetId = `${chainId}:${NATIVE_CURRENCY}`
let send: SendCapabilityFake
type BalanceFixture = ReturnType<typeof nativeBalance>
type CommandCall = [command: AppCommand]
type QueryCall = [query: AppQuery]
const commandCalls = () => fixture.client.executeCommand.mock.calls as CommandCall[]
const queryCalls = () => fixture.client.executeQuery.mock.calls as QueryCall[]

function updateSendState(changes: Record<string, unknown>) {
  fixture.state.reset({ ...fixture.state.getState(), ...changes })
}

function initializeSendState(balances: BalanceFixture[] = [nativeBalance()]) {
  fixture.state.reset({
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
    assetRates: {},
    runtime: {
      profile: 'dev',
      isDev: true,
      environment: 'test'
    },
    tokens: {
      byId: {},
      accountTokenIds: {}
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

describe('Send controller integration', () => {
  beforeEach(() => {
    send = createSendCapabilityFake()
    initializeSendState()
  })

  it('renders an empty state when there are no sendable assets', () => {
    initializeSendState([])

    render(<Send capability={send} />)

    expect(screen.getByText('No assets available to send.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Close Send' }))
    expect(send.close).toHaveBeenCalledTimes(1)
  })

  it('clears recipient, amount, and open menus when the current account changes', async () => {
    const { user } = render(<Send assetId={nativeAssetId} capability={send} />)
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

  it('ignores a submission result from the previously selected account', async () => {
    let resolveSubmission: (result: CommandResult) => void = () => undefined
    send.submit.mockImplementation(() => {
      return new Promise<CommandResult>((resolve) => {
        resolveSubmission = resolve
      })
    })

    const { user } = render(<Send assetId={nativeAssetId} capability={send} />)
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
    const { user } = render(<Send assetId={nativeAssetId} capability={send} />)
    const recipientButton = screen.getByRole('button', { name: 'Select Recipient' })

    await user.click(recipientButton)

    const proceedButton = screen.getByRole('button', { name: 'Proceed' })
    expect(proceedButton.hasAttribute('disabled')).toBe(false)

    await user.click(proceedButton)

    const command = send.submit.mock.calls.at(-1)?.[0] as {
      operationId: string
      asset: { address: string; chainId: number }
      amount: string
      recipient: string
    }
    expect(command).toEqual({
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
    render(<Send assetId={nativeAssetId} capability={send} />)

    fireEvent.change(screen.getByLabelText('Recipient'), {
      target: { value: 'unknown.eth' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Proceed' }))

    const command = send.submit.mock.calls.at(-1)?.[0] as { operationId: string }
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
    expect(queryCalls()).toEqual([])
    expect(commandCalls()).toEqual([])
  })
})
