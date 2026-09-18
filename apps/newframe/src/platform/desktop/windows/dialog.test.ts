import { describe, expect, it, mock } from 'bun:test'

import { electronMock } from '../../../../test/support/electron.mock'
import { showUnhandledExceptionDialog } from './dialog'

const { quit, relaunch } = electronMock.app
const { showErrorBox, showMessageBoxSync } = electronMock.dialog

await mock.module('./', () => ({
  browserWindows: () => ({ panel: 'mock tray browserwindow' })
}))

describe('#showUnhandledExceptionDialog', () => {
  it('displays the error message to the user', () => {
    showUnhandledExceptionDialog('something bad happened')

    expect(showMessageBoxSync).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        detail: 'something bad happened'
      })
    )
  })

  it('gives the user an option to accept the error or quit Newframe', () => {
    showUnhandledExceptionDialog('something bad happened')

    expect(showMessageBoxSync).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        buttons: ['OK', 'Quit']
      })
    )
  })

  it('will relaunch the app when the user clicks OK', () => {
    showMessageBoxSync.mockImplementation(() => 0)

    showUnhandledExceptionDialog('something bad happened')

    expect(relaunch).toHaveBeenCalled()
    expect(quit).toHaveBeenCalled()
  })

  it('will not relaunch the app when the user clicks quit', () => {
    showMessageBoxSync.mockImplementation(() => 1)

    showUnhandledExceptionDialog('something bad happened')

    expect(relaunch).not.toHaveBeenCalled()
    expect(quit).toHaveBeenCalled()
  })

  it('shows a simple error box and quits for an EADDRINUSE error', () => {
    showUnhandledExceptionDialog('Newframe is already running', 'EADDRINUSE')

    expect(showErrorBox).toHaveBeenCalled()
    expect(showMessageBoxSync).not.toHaveBeenCalled()
    expect(relaunch).not.toHaveBeenCalled()
    expect(quit).toHaveBeenCalled()
  })
})
