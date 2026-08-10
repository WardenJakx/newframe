import { describe, expect, it } from 'bun:test'
import type { Mock } from 'bun:test'
import { useState } from 'react'

import type { OperationRecord } from '../../../../../platform/operations/operation'
import { act, render, screen } from '../../../../../../test/support/componentSetup'
import { registerTestRuntimeFixture } from '../../../../../../test/support/rendererClient'
import { walletState } from '../../../../../platform/state-sync/renderer/fixtures.test-support.ts'
import { OrderDetails } from './OrderDetails'
import { Orders as OrdersController, type OpenOrderInput } from './Orders'
import { OrdersView } from './OrdersView'
import { createOrdersCapability } from './ordersCapability'
import type { OrderRow } from './orderTypes'
import type { ComponentProps } from 'react'
import type { AppCommand, CommandMap, CommandResult } from '../../../../../app/contracts/operations'
import type { WalletRendererState } from '../../../../../platform/state-sync/contract/projections'

const fixture = registerTestRuntimeFixture()
const ordersCapability = createOrdersCapability({
  executeCommand: (command) => fixture.client.executeCommand(command)
})
const Orders = (props: Omit<ComponentProps<typeof OrdersController>, 'capability'>) => (
  <OrdersController {...props} capability={ordersCapability} />
)
const accountAddress = '0x1111111111111111111111111111111111111111'
type ExecuteCommandMock = Mock<(command: AppCommand) => Promise<CommandResult>>
type CancelCommand = CommandMap['flash.order-cancel']
const executeCommandMock = () => fixture.client.executeCommand as unknown as ExecuteCommandMock

function order(cancellable = true) {
  return {
    orderId: 'order-1',
    accountAddress,
    provider: 'flash' as const,
    status: cancellable ? 'open' : 'cancelled',
    orderType: 'limit',
    side: 'sell',
    targetAsset: { symbol: 'WETH', chainId: 1 },
    contraAsset: { symbol: 'USDC', chainId: 1 },
    qty: '1',
    createdAt: 1,
    updatedAt: 2,
    open: cancellable,
    cancellable
  }
}

function cancelButton(orderId: string) {
  return document.querySelector<HTMLButtonElement>(`[data-order-id="${orderId}"] button`)
}

function state(orders: WalletRendererState['orders'], operations: Record<string, OperationRecord> = {}) {
  return walletState({
    currentAccount: 'account-1',
    accounts: {
      'account-1': {
        id: 'account-1',
        address: accountAddress,
        name: 'Account 1',
        lastSignerType: 'address'
      } as WalletRendererState['accounts'][string]
    },
    accountOrder: ['account-1'],
    networks: {
      ethereum: {
        1: {
          id: 1,
          name: 'Ethereum',
          isTestnet: false,
          on: true
        } as WalletRendererState['networks']['ethereum'][number]
      }
    },
    orders,
    operations
  })
}

function OrderOverlay() {
  const [selected, setSelected] = useState<OpenOrderInput | null>(null)
  return (
    <>
      <Orders onOpenOrder={setSelected} selectedChainId={0} />
      {selected ? (
        <OrderDetails
          assetImages={selected.assetImages}
          capability={ordersCapability}
          onBack={() => setSelected(null)}
          orderId={selected.orderId}
        />
      ) : null}
    </>
  )
}

describe('Orders cancellation', () => {
  it('uses projected operation and order state for failure, retry, and completion', async () => {
    fixture.state.reset(state({ 'order-1': order() }))
    let resolveFirst!: (value: CommandResult) => void
    let cancelCalls = 0
    executeCommandMock().mockImplementation(async (command) => {
      if (command.type !== 'flash.order-cancel') return { ok: true }
      cancelCalls += 1
      if (cancelCalls === 1) return await new Promise<CommandResult>((resolve) => (resolveFirst = resolve))
      return { ok: true }
    })

    const { user } = render(<Orders onOpenOrder={() => {}} selectedChainId={0} />)

    const cancel = screen.getByRole<HTMLButtonElement>('button', { name: 'Cancel order' })
    await user.click(cancel)
    const firstCommand = executeCommandMock().mock.calls.at(-1)?.[0] as CancelCommand
    expect(firstCommand).toEqual({
      type: 'flash.order-cancel',
      operationId: expect.any(String),
      orderId: 'order-1'
    })
    expect(cancel.disabled).toBe(true)

    act(() => {
      fixture.state.reset(
        state(
          { 'order-1': order() },
          {
            [firstCommand.operationId]: {
              id: firstCommand.operationId,
              type: 'flash.order-cancel',
              status: 'failed',
              error: { code: 'cancel_failed', message: 'Order could not be cancelled safely.' },
              startedAt: 1,
              updatedAt: 2,
              finishedAt: 2
            }
          }
        )
      )
    })

    expect(await screen.findByText('Order could not be cancelled safely.')).toBeTruthy()
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Cancel order' }).disabled).toBe(false)

    await user.click(screen.getByRole('button', { name: 'Cancel order' }))
    const retryCommand = executeCommandMock().mock.calls.at(-1)?.[0] as CancelCommand
    expect(retryCommand.operationId).not.toBe(firstCommand.operationId)
    resolveFirst({ ok: false, error: 'invalid_command', message: 'Stale cancel acknowledgement.' })
    await act(async () => await Promise.resolve())
    expect(screen.queryByText('Stale cancel acknowledgement.')).toBe(null)
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Cancel order' }).disabled).toBe(true)

    act(() => {
      fixture.state.reset(
        state(
          { 'order-1': order() },
          {
            [retryCommand.operationId]: {
              id: retryCommand.operationId,
              type: 'flash.order-cancel',
              status: 'succeeded',
              entityRefs: [{ type: 'order', id: 'order-1' }],
              startedAt: 3,
              updatedAt: 4,
              finishedAt: 4
            }
          }
        )
      )
    })

    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Cancel order' }).disabled).toBe(false)

    act(() => {
      fixture.state.reset(
        state(
          { 'order-1': order(false) },
          {
            [retryCommand.operationId]: {
              id: retryCommand.operationId,
              type: 'flash.order-cancel',
              status: 'succeeded',
              entityRefs: [{ type: 'order', id: 'order-1' }],
              startedAt: 3,
              updatedAt: 5,
              finishedAt: 5
            }
          }
        )
      )
    })

    expect(screen.queryByRole('button', { name: 'Cancel order' })).toBe(null)
  })

  it('allows different orders to be cancelled independently', async () => {
    fixture.state.reset(
      state({
        'order-1': order(),
        'order-2': { ...order(), orderId: 'order-2' }
      })
    )
    executeCommandMock().mockImplementation(async (command) =>
      command.type === 'flash.order-cancel' ? await new Promise(() => undefined) : { ok: true }
    )

    const { user } = render(<Orders onOpenOrder={() => {}} selectedChainId={0} />)

    await user.click(cancelButton('order-1')!)
    expect(cancelButton('order-1')?.disabled).toBe(true)
    expect(cancelButton('order-2')?.disabled).toBe(false)

    await user.click(cancelButton('order-2')!)
    const cancelCommands = executeCommandMock()
      .mock.calls.map(([command]) => command as { orderId?: string; type?: string })
      .filter(
        (command): command is { orderId: string; type: 'flash.order-cancel' } =>
          command.type === 'flash.order-cancel' && typeof command.orderId === 'string'
      )
    expect(cancelCommands.map((command) => command.orderId)).toEqual(['order-1', 'order-2'])
    expect(cancelButton('order-2')?.disabled).toBe(true)
  })
})

describe('Orders display', () => {
  it('hands the table image source to the detail overlay', async () => {
    const address = '0x1111111111111111111111111111111111111111'
    const iconSource = 'data:image/png;base64,d2V0aA=='
    const orderWithImage = {
      ...order(false),
      targetAsset: {
        id: 'flash-weth',
        address,
        chainId: 1,
        isNative: false,
        symbol: 'WETH'
      }
    }
    const initial = state({ 'order-1': orderWithImage })
    initial.tokens = {
      byId: {
        [`1:${address}`]: {
          image: { base64: 'd2V0aA==', mimeType: 'image/png' }
        } as WalletRendererState['tokens']['byId'][string]
      },
      accountTokenIds: {}
    }
    fixture.state.reset(initial)
    const { user } = render(<OrderOverlay />)

    await user.click(screen.getByRole('button', { name: /order details/i }))
    act(() => fixture.state.reset(state({ 'order-1': orderWithImage })))

    expect(
      Array.from(document.querySelectorAll('img')).filter((image) => image.getAttribute('src') === iconSource)
    ).toHaveLength(1)
  })

  it('renders model rows and emits row and cancellation events independently', async () => {
    const openOrder = { ...order(), orderId: 'open-order' }
    const filledOrder = {
      ...order(false),
      orderId: 'filled-order',
      status: 'filled',
      filledOutputAmount: '2400',
      contraNotional: '2400'
    }
    const cancelledOrders: OrderRow[] = []
    const openedOrders: OrderRow[] = []
    const { user } = render(
      <OrdersView
        cancelErrors={{}}
        cancellingOrderIds={new Set()}
        imageCapability={ordersCapability}
        networks={{}}
        networksMeta={{}}
        onCancel={(value) => cancelledOrders.push(value)}
        onOpen={(value) => openedOrders.push(value)}
        orders={[openOrder, filledOrder]}
        tokens={{ byId: {}, accountTokenIds: {} }}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Cancel order' }))
    expect(cancelledOrders).toHaveLength(1)
    expect(cancelledOrders[0]).toBe(openOrder)
    expect(openedOrders).toHaveLength(0)
    await user.click(screen.getAllByRole('button', { name: /order details/i })[1])
    expect(openedOrders).toHaveLength(1)
    expect(openedOrders[0]).toBe(filledOrder)
  })
})
