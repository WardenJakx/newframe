import path from 'path'

import { app } from 'electron'
import Conf from 'conf'

import { ValidatedConfStorage } from './validatedConfStorage'
import { CANONICAL_STATE_STORAGE_NAME } from './schema'

export type { PersistedCanonicalState } from './schema'
export { PERSISTENCE_VERSION } from './schema'
export { ValidatedConfStorage } from './validatedConfStorage'

export { CANONICAL_STATE_STORAGE_NAME }
const cwd = app?.getPath('userData') || __dirname
const conf = new Conf<Record<string, unknown>>({
  projectName: 'newframe',
  configFileMode: 0o600,
  configName: 'config',
  cwd: path.isAbsolute(cwd) ? cwd : path.resolve(__dirname, cwd)
})
const storage = new ValidatedConfStorage(conf)

app?.on('before-quit', () => storage.flush())
setInterval(() => storage.flush(), 30_000).unref()

export default storage
