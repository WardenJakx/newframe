import Conf from 'conf'

import type { PersistenceSchedulerPort, PersistenceStoragePort } from './ports.js'

export interface ProductionPersistencePorts {
  storage: PersistenceStoragePort
  scheduler: PersistenceSchedulerPort
}

export function createProductionPersistencePorts(cwd: string): ProductionPersistencePorts {
  const storage = new Conf<Record<string, unknown>>({
    projectName: 'newframe',
    configFileMode: 0o600,
    configName: 'config',
    cwd
  })

  return {
    storage,
    scheduler: {
      scheduleEvery(intervalMs, task) {
        const timer = setInterval(task, intervalMs)
        timer.unref()
        return () => clearInterval(timer)
      }
    }
  }
}
