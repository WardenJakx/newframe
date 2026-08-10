import link from '../../../platform/ipc/renderer/link'
import { createConnectionsCapability } from '../../../features/connections/renderer/connectionsCapability'
import { createNetworksCapability } from '../../../features/networks/renderer/networksCapability'
import { createPortfolioCapability } from '../../../features/portfolio/renderer/portfolioCapability'
import { createSecurityCapability } from '../../../features/security/renderer/securityCapability'
import { createSettingsCapability } from '../../../features/settings/renderer/settingsCapability'
import { createTokensCapability } from '../../../features/tokens/renderer/tokensCapability'
import { createActivityCapability } from '../../../features/transactions/renderer/activity/activityCapability'
import { createOrdersCapability } from '../../../features/transactions/trade/renderer/orders/ordersCapability'

export const connectionsCapability = createConnectionsCapability(link)
export const networksCapability = createNetworksCapability(link)
export const portfolioCapability = createPortfolioCapability(link)
export const securityCapability = createSecurityCapability(link)
export const settingsCapability = createSettingsCapability(link)
export const tokensCapability = createTokensCapability(link)
export const activityCapability = createActivityCapability(link)
export const ordersCapability = createOrdersCapability(link)
