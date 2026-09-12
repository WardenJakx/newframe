import { createRequestRendererCapabilities } from '../../../features/requests/renderer/requestCapabilities'
import link from '../../../platform/ipc/renderer/link'

export const requestCapabilities = createRequestRendererCapabilities(link)
