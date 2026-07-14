import { expect, it } from 'bun:test'

import { render, screen } from '../../componentSetup'
import { TrayNotificationProvider, useTrayNotification } from '../../../app/tray/notification'

function NotificationConsumer() {
  const { data, notify, type } = useTrayNotification()

  return (
    <>
      <div data-testid='notification'>{type ? `${type}:${String(data.message)}` : 'none'}</div>
      <button onClick={() => notify('warning', { message: 'check transaction' })}>Show</button>
      <button onClick={() => notify()}>Clear</button>
    </>
  )
}

it('keeps overlay notification state within the tray renderer', async () => {
  const { user } = render(
    <TrayNotificationProvider>
      <NotificationConsumer />
    </TrayNotificationProvider>
  )

  expect(screen.getByTestId('notification').textContent).toBe('none')

  await user.click(screen.getByRole('button', { name: 'Show' }))
  expect(screen.getByTestId('notification').textContent).toBe('warning:check transaction')

  await user.click(screen.getByRole('button', { name: 'Clear' }))
  expect(screen.getByTestId('notification').textContent).toBe('none')
})
