import link from '../../../platform/ipc/renderer/link'
import { createRequestRendererCapabilities } from '../../../features/requests/renderer/requestCapabilities'

export const requestCapabilities = createRequestRendererCapabilities(link)
