import { describe, expect, it, mock } from 'bun:test'

import { frameStateStore } from '../../../newframe-extension/src/frameState'
import { SettingsView, type SettingsViewProps } from '../../../newframe-extension/src/settings/SettingsView'
import { fireEvent, render, screen } from '../support/componentSetup'

function props(overrides: Partial<SettingsViewProps> = {}): SettingsViewProps {
  return {
    settings: frameStateStore.getState(),
    tab: { url: 'https://example.com' },
    isSupportedTab: true,
    mmAppear: false,
    onSummon: mock(() => {}),
    onRetryConnection: mock(() => {}),
    onDisconnect: mock(() => {}),
    onToggleMetaMask: mock(() => {}),
    onSelectChain: mock(() => {}),
    ...overrides
  }
}

describe('SettingsView', () => {
  it.each(['desktop-unavailable', 'extension-approval-pending', 'extension-approval-rejected'] as const)(
    'offers an explicit retry while %s, including on unsupported tabs',
    (connectionStatus) => {
      const initial = props({
        isSupportedTab: false,
        settings: { ...frameStateStore.getState(), connectionStatus }
      })
      render(<SettingsView {...initial} />)
      expect(screen.queryByRole('switch')).toBeNull()
      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Retry connection' }).disabled).toBe(false)
    }
  )

  it('gates site controls on desktop connection and tab support', () => {
    const initial = props()
    const { rerender } = render(<SettingsView {...initial} />)
    expect(screen.getByText('Newframe desktop app not found')).toBeTruthy()
    expect(screen.queryByRole('switch')).toBeNull()
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Newframe Not Running' }).disabled).toBe(
      true
    )

    rerender(
      <SettingsView
        {...initial}
        settings={{ ...initial.settings, connectionStatus: 'extension-approval-pending' }}
      />
    )
    expect(screen.getByText('Approve the browser extension')).toBeTruthy()
    expect(screen.queryByRole('switch')).toBeNull()

    rerender(
      <SettingsView
        {...initial}
        isSupportedTab={false}
        settings={{ ...initial.settings, connectionStatus: 'connected' }}
      />
    )
    expect(screen.getByText('Unsupported tab')).toBeTruthy()
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('renders connected state and routes user actions through callbacks', () => {
    const initial = props({
      mmAppear: true,
      settings: { ...frameStateStore.getState(), connectionStatus: 'connected', siteConnected: true }
    })
    render(<SettingsView {...initial} />)
    expect(screen.queryByRole('button', { name: 'Retry connection' })).toBeNull()
    expect(screen.getByText('example.com')).toBeTruthy()
    expect(screen.getByRole('switch', { name: 'Appear as MetaMask' }).getAttribute('aria-checked')).toBe(
      'true'
    )
    fireEvent.click(screen.getByRole('button', { name: 'Newframe Connected' }))
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect this site' }))
    fireEvent.click(screen.getByRole('switch', { name: 'Appear as MetaMask' }))
    expect(initial.onSummon).toHaveBeenCalledTimes(1)
    expect(initial.onDisconnect).toHaveBeenCalledTimes(1)
    expect(initial.onToggleMetaMask).toHaveBeenCalledTimes(1)
  })
})
