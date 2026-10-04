import link from '../../ipc/renderer/link.ts'
import { createUpdaterCapability } from './updaterCapability.ts'

export const updaterCapability = createUpdaterCapability(link)
