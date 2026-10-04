import { createConnectionsCapability } from '../../../features/connections/renderer/connectionsCapability.ts'
import { createNetworksCapability } from '../../../features/networks/renderer/networksCapability.ts'
import { createPortfolioCapability } from '../../../features/portfolio/renderer/portfolioCapability.ts'
import { createSecurityCapability } from '../../../features/security/renderer/securityCapability.ts'
import { createSettingsCapability } from '../../../features/settings/renderer/settingsCapability.ts'
import { createTokensCapability } from '../../../features/tokens/renderer/tokensCapability.ts'
import { createActivityCapability } from '../../../features/transactions/renderer/activity/activityCapability.ts'
import { createOrdersCapability } from '../../../features/transactions/trade/renderer/orders/ordersCapability.ts'
import link from '../../../platform/ipc/renderer/link.ts'

export const connectionsCapability = createConnectionsCapability(link)
export const networksCapability = createNetworksCapability(link)
export const portfolioCapability = createPortfolioCapability(link)
export const securityCapability = createSecurityCapability(link)
export const settingsCapability = createSettingsCapability(link)
export const tokensCapability = createTokensCapability(link)
export const activityCapability = createActivityCapability(link)
export const ordersCapability = createOrdersCapability(link)
