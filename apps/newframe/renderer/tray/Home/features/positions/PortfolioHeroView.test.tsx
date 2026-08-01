import { describe, expect, it, jest as timers } from 'bun:test'
import type { Mock } from 'bun:test'

import { act, render, screen } from '../../../../../test/support/componentSetup'
import { createHostFixture } from '../../../../../test/support/rendererClient'
import { resetStateMirrorForTests } from '../../../../state/rendererStore'
import { walletState } from '../../../../state/fixtures.test-support'
import { HomeUiProvider } from '../../state/HomeUiProvider'
import { formatPortfolioValue, PortfolioHero } from './PortfolioHero'
import { PortfolioHeroView } from './PortfolioHeroView'
import type { OperationRecord } from '../../../../../domain/state/operation'
import type { PortfolioRefreshCommand } from '../../../../../contracts/operations'

const noop = () => {}
const link = createHostFixture()

function renderHero(displayValue: string) {
  return render(
    <PortfolioHeroView
      canSend
      canTrade
      displayValue={displayValue}
      onRefresh={noop}
      onSend={noop}
      onTrade={noop}
      refreshing={false}
    />
  )
}

describe('PortfolioHero', () => {
  it('uses projected terminal state for completion and bounds command rejection by the minimum dwell', async () => {
    timers.useFakeTimers()
    try {
      resetStateMirrorForTests(walletState({}))
      ;(link.executeCommand as Mock<any>)
        .mockResolvedValueOnce({ ok: false, error: 'internal', message: 'Refresh unavailable.' })
        .mockResolvedValue({ ok: true })
      const { user } = render(
        <HomeUiProvider>
          <PortfolioHero />
        </HomeUiProvider>,
        { advanceTimersAfterInput: 0 }
      )
      const refresh = screen.getByRole<HTMLButtonElement>('button', { name: 'Refresh balances' })

      await user.click(refresh)
      const rejectedCommand = (link.executeCommand as Mock<any>).mock.calls.at(
        -1
      )![0] as PortfolioRefreshCommand
      expect(rejectedCommand).toEqual({ type: 'portfolio.refresh', operationId: expect.any(String) })
      expect(refresh.disabled).toBe(true)
      act(() => timers.advanceTimersByTime(500))
      expect(refresh.disabled).toBe(true)
      act(() => timers.advanceTimersByTime(500))
      expect(refresh.disabled).toBe(false)

      await user.click(refresh)
      const acceptedCommand = (link.executeCommand as Mock<any>).mock.calls.at(
        -1
      )![0] as PortfolioRefreshCommand
      expect(acceptedCommand.operationId).not.toBe(rejectedCommand.operationId)
      expect(refresh.disabled).toBe(true)
      act(() => {
        resetStateMirrorForTests(
          walletState({
            operations: {
              [acceptedCommand.operationId]: {
                id: acceptedCommand.operationId,
                type: acceptedCommand.type,
                status: 'succeeded',
                startedAt: 1,
                updatedAt: 2,
                finishedAt: 2
              } satisfies OperationRecord
            }
          })
        )
      })
      expect(refresh.disabled).toBe(true)
      act(() => timers.advanceTimersByTime(1000))
      expect(refresh.disabled).toBe(false)
    } finally {
      timers.useRealTimers()
    }
  })

  it('formats fully unknown and partially priced holdings without inventing value', () => {
    const displayValue = formatPortfolioValue([
      { hasPrice: false, totalValue: 0 },
      { hasPrice: false, totalValue: 0 }
    ])

    const view = renderHero(displayValue)

    expect(screen.getByRole('group', { name: 'Portfolio value' }).textContent).toBe('—')
    view.unmount()

    const partialDisplayValue = formatPortfolioValue([
      { hasPrice: true, totalValue: 12.34 },
      { hasPrice: false, totalValue: 0 }
    ])

    renderHero(partialDisplayValue)

    expect(screen.getByRole('group', { name: 'Portfolio value' }).textContent).toBe('$12.34')
  })
})
