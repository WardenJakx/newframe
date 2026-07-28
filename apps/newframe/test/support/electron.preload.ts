import { beforeEach, mock } from 'bun:test'
import log from 'electron-log'

import { electronMock } from './electron.mock'

log.transports.file.level = false

mock.module('electron', () => ({ default: electronMock, ...electronMock }))

beforeEach(() => {
  mock.clearAllMocks()
})
