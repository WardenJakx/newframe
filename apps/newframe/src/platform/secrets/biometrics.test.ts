import { expect, it } from 'bun:test'

import { electronMock } from '../../../test/support/electron.mock.ts'
import biometrics from './biometrics.ts'

it('checks native biometric support without opening Safe Storage', () => {
  electronMock.systemPreferences.canPromptTouchID.mockImplementation(() => true)
  electronMock.safeStorage.isEncryptionAvailable.mockImplementation(() => {
    throw new Error('Safe Storage should stay lazy')
  })

  expect(biometrics.summary().nativeAvailable).toBe(true)
  expect(electronMock.safeStorage.isEncryptionAvailable).not.toHaveBeenCalled()
})
