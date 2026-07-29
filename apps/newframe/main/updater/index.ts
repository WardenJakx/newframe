import log from 'electron-log'

import type { CanonicalStore } from '../store/actions.js'

export interface VersionUpdate {
  version: string
  location: string
}

export class Updater {
  constructor(store: { getState(): CanonicalStore }) {
    void store
  }

  start() {
    log.info('Automatic desktop updates are disabled for unsigned releases')
  }

  stop() {
    log.verbose('Desktop updater stopped')
  }

  get updateReady() {
    return false
  }

  fetchUpdate() {
    log.warn('Ignoring update download request because automatic desktop updates are disabled')
  }

  quitAndInstall() {
    log.warn('Ignoring update installation request because automatic desktop updates are disabled')
  }

  dismissUpdate() {
    log.verbose('Ignoring update dismissal because automatic desktop updates are disabled')
  }
}
