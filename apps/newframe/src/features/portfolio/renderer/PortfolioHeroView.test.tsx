import { describe, expect, it, jest as timers } from 'bun:test'

import { act, render, screen } from '../../../../test/support/componentSetup'
import { registerTestRuntimeFixture } from '../../../../test/support/rendererClient'
import { walletState } from '../../../platform/state-sync/renderer/fixtures.test-support.ts'
import { formatPortfolioValue, PortfolioHero } from './PortfolioHero'
import { PortfolioHeroView } from './PortfolioHeroView'
import type { OperationRecord } from '../../../platform/operations/operation'
import type { AppCommand } from '../../../app/contracts/operations'
import { createPortfolioCapability } from './portfolioCapability'

const noop = () => {}
const fixture = registerTestRuntimeFixture()
const capability = createPortfolioCapability({
  executeCommand: (command) => fixture.client.executeCommand(command)
})
type CommandCall = [command: AppCommand]
const commandCalls = () => fixture.client.executeCommand.mock.calls as CommandCall[]

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
      fixture.state.reset(walletState({}))
      fixture.client.executeCommand
        .mockResolvedValueOnce({ ok: false, error: 'operation_failed', message: 'Refresh unavailable.' })
        .mockResolvedValue({ ok: true })
      const { user } = render(<PortfolioHero capability={capability} selectedChainId={0} />, {
        advanceTimersAfterInput: 0
      })
      const refresh = screen.getByRole<HTMLButtonElement>('button', { name: 'Refresh balances' })

      await user.click(refresh)
      const rejectedCommand = commandCalls().at(-1)?.[0]
      if (rejectedCommand?.type !== 'portfolio.refresh') throw new Error('Expected portfolio refresh')
      expect(rejectedCommand).toEqual({ type: 'portfolio.refresh', operationId: expect.any(String) })
      expect(refresh.disabled).toBe(true)
      act(() => timers.advanceTimersByTime(500))
      expect(refresh.disabled).toBe(true)
      act(() => timers.advanceTimersByTime(500))
      expect(refresh.disabled).toBe(false)

      await user.click(refresh)
      const acceptedCommand = commandCalls().at(-1)?.[0]
      if (acceptedCommand?.type !== 'portfolio.refresh') throw new Error('Expected portfolio refresh')
      expect(acceptedCommand.operationId).not.toBe(rejectedCommand.operationId)
      expect(refresh.disabled).toBe(true)
      act(() => {
        fixture.state.reset(
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
