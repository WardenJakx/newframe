import { describe, expect, it } from 'bun:test'
import type { Mock } from 'bun:test'

import type { OperationRecord } from '../../../../../platform/operations/operation'
import { act, render, screen } from '../../../../../../test/support/componentSetup'
import { createHostFixture } from '../../../../../../test/support/rendererClient'
import { walletState } from '../../../../../platform/state-sync/renderer/fixtures.test-support.ts'
import { resetStateMirrorForTests } from '../../../../../platform/state-sync/renderer/rendererStore'
import { HomeUiProvider, useHomeUiStore } from '../../../../../app/renderer/tray/Home/state/HomeUiProvider'
import { OrderDetails } from './OrderDetails'
import { Orders } from './Orders'

const link = createHostFixture()
const accountAddress = '0x1111111111111111111111111111111111111111'

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

function state(orders: Record<string, any>, operations: Record<string, OperationRecord> = {}) {
  return walletState({
    currentAccount: 'account-1',
    accounts: {
      'account-1': {
        id: 'account-1',
        address: accountAddress,
        name: 'Account 1',
        lastSignerType: 'address'
      } as any
    },
    accountOrder: ['account-1'],
    networks: { ethereum: { 1: { id: 1, name: 'Ethereum', isTestnet: false, on: true } as any } },
    orders,
    operations
  })
}

function OrderOverlay() {
  const overlay = useHomeUiStore((current) => current.overlay)
  return overlay.type === 'order' ? (
    <OrderDetails assetImages={overlay.assetImages} orderId={overlay.orderId} />
  ) : null
}

describe('Orders cancellation', () => {
  it('uses projected operation and order state for failure, retry, and completion', async () => {
    resetStateMirrorForTests(state({ 'order-1': order() }))
    let resolveFirst!: (value: unknown) => void
    let cancelCalls = 0
    ;(link.executeCommand as Mock<any>).mockImplementation(async (command: any) => {
      if (command.type !== 'flash.order-cancel') return { ok: true }
      cancelCalls += 1
      if (cancelCalls === 1) return await new Promise((resolve) => (resolveFirst = resolve))
      return { ok: true }
    })

    const { user } = render(
      <HomeUiProvider>
        <Orders />
      </HomeUiProvider>
    )

    const cancel = screen.getByRole<HTMLButtonElement>('button', { name: 'Cancel order' })
    await user.click(cancel)
    const firstCommand: any = (link.executeCommand as Mock<any>).mock.calls.at(-1)?.[0]
    expect(firstCommand).toEqual({
      type: 'flash.order-cancel',
      operationId: expect.any(String),
      orderId: 'order-1'
    })
    expect(cancel.disabled).toBe(true)

    act(() => {
      resetStateMirrorForTests(
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
    const retryCommand: any = (link.executeCommand as Mock<any>).mock.calls.at(-1)?.[0]
    expect(retryCommand.operationId).not.toBe(firstCommand.operationId)
    resolveFirst({ ok: false, error: 'invalid_command', message: 'Stale cancel acknowledgement.' })
    await act(async () => await Promise.resolve())
    expect(screen.queryByText('Stale cancel acknowledgement.')).toBe(null)
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Cancel order' }).disabled).toBe(true)

    act(() => {
      resetStateMirrorForTests(
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
      resetStateMirrorForTests(
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
    resetStateMirrorForTests(
      state({
        'order-1': order(),
        'order-2': { ...order(), orderId: 'order-2' }
      })
    )
    ;(link.executeCommand as Mock<any>).mockImplementation(async (command: any) =>
      command.type === 'flash.order-cancel' ? await new Promise(() => undefined) : { ok: true }
    )

    const { user } = render(
      <HomeUiProvider>
        <Orders />
      </HomeUiProvider>
    )

    await user.click(cancelButton('order-1')!)
    expect(cancelButton('order-1')?.disabled).toBe(true)
    expect(cancelButton('order-2')?.disabled).toBe(false)

    await user.click(cancelButton('order-2')!)
    const cancelCommands = (link.executeCommand as Mock<any>).mock.calls
      .map(([command]) => command as { orderId?: string; type?: string })
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
        } as any
      },
      accountTokenIds: {}
    }
    resetStateMirrorForTests(initial)
    const { user } = render(
      <HomeUiProvider>
        <Orders />
        <OrderOverlay />
      </HomeUiProvider>
    )

    await user.click(screen.getByRole('button', { name: /order details/i }))
    act(() => resetStateMirrorForTests(state({ 'order-1': orderWithImage })))

    expect(
      Array.from(document.querySelectorAll('img')).filter((image) => image.getAttribute('src') === iconSource)
    ).toHaveLength(1)
  })

  it('shows the OT asset with realized contra values and replaces incomplete results with a dash', () => {
    const openOrder = {
      ...order(),
      orderId: 'open-order',
      spentAmount: '1',
      outputAmount: '2400',
      targetNotional: '2400'
    }
    const filledOrder = {
      ...order(false),
      orderId: 'filled-order',
      status: 'filled',
      spentAmount: '1',
      outputAmount: '2400',
      filledOutputAmount: '2400',
      targetNotional: '2400'
    }
    const buyOrder = {
      ...order(false),
      orderId: 'buy-order',
      status: 'filled',
      side: 'buy',
      spentAmount: '100',
      outputAmount: '0.04',
      filledOutputAmount: '0.04',
      targetNotional: '99',
      contraNotional: '100'
    }

    resetStateMirrorForTests(
      state({ 'open-order': openOrder, 'filled-order': filledOrder, 'buy-order': buyOrder })
    )
    render(
      <HomeUiProvider>
        <Orders />
      </HomeUiProvider>
    )

    const openRow = document.querySelector('[data-order-id="open-order"]')
    const filledRow = document.querySelector('[data-order-id="filled-order"]')
    const buyRow = document.querySelector('[data-order-id="buy-order"]')
    expect(openRow?.textContent).toContain('WETH')
    expect(openRow?.textContent).toContain('LimitSELL')
    expect(openRow?.textContent).toContain('1970')
    expect(openRow?.textContent?.match(/—/g)).toHaveLength(1)
    expect(openRow?.textContent).not.toContain('2,400 USDC')
    expect(filledRow?.textContent).toContain('$2,400.00')
    expect(filledRow?.textContent).toContain('2,400 USDC')
    expect(filledRow?.textContent).toContain('Filled')
    expect(buyRow?.textContent).toContain('LimitBUY')
    expect(buyRow?.textContent).toContain('100 USDC')
    expect(buyRow?.textContent).not.toContain('←')
  })
})
