import { powerMonitor } from 'electron'
import log from 'electron-log'

// Newframe locks when the computer's screen locks or it sleeps. Only the human
// unlocks it, so waking or unlocking the computer does nothing here.
export function lockWithSystem(lock: () => void) {
  const lockFor = (reason: string) => () => {
    log.info(`System ${reason}, locking Newframe`)
    lock()
  }

  powerMonitor.on('lock-screen', lockFor('screen locked'))
  powerMonitor.on('suspend', lockFor('suspending'))
}
