import { beforeEach, mock } from 'bun:test'

import log from 'electron-log'

import { electronMock } from './electron.mock.ts'

log.transports.file.level = false

await mock.module('electron', () => ({ default: electronMock, ...electronMock }))

beforeEach(() => {
  mock.clearAllMocks()
})
