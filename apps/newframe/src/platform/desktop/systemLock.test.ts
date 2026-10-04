import { expect, it, mock } from 'bun:test'

import { electronMock } from '../../../test/support/electron.mock.ts'
import { lockWithSystem } from './systemLock.ts'

const emit = (event: string) =>
  electronMock.powerMonitor.on.mock.calls
    .filter(([name]) => name === event)
    .forEach(([, listener]) => (listener as () => void)())

it('locks Newframe when the screen locks or the computer sleeps, and never unlocks it', () => {
  const lock = mock()
  lockWithSystem(lock)

  emit('lock-screen')
  emit('suspend')
  expect(lock).toHaveBeenCalledTimes(2)

  emit('unlock-screen')
  emit('resume')
  expect(lock).toHaveBeenCalledTimes(2)
  expect(electronMock.powerMonitor.on).toHaveBeenCalledTimes(2)
})
