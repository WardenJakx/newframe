import { createRequestRendererCapabilities } from '../../../features/requests/renderer/requestCapabilities.ts'
import link from '../../../platform/ipc/renderer/link.ts'

export const requestCapabilities = createRequestRendererCapabilities(link)
