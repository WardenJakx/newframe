import { createActivityCapability } from '../../features/activity/activityCapability.ts'
import { createChainsCapability } from '../../features/chains/chainsCapability.ts'
import { createConnectionsCapability } from '../../features/connected-dapps/connectionsCapability.ts'
import { createPortfolioCapability } from '../../features/portfolio/portfolioCapability.ts'
import { createSecurityCapability } from '../../features/security/securityCapability.ts'
import { createSettingsCapability } from '../../features/settings/settingsCapability.ts'
import { createTokensCapability } from '../../features/tokens/tokensCapability.ts'
import { createOrdersCapability } from '../../features/trading/orders/ordersCapability.ts'
import link from '../../shared/host/link.ts'

export const connectionsCapability = createConnectionsCapability(link)
export const chainsCapability = createChainsCapability(link)
export const portfolioCapability = createPortfolioCapability(link)
export const securityCapability = createSecurityCapability(link)
export const settingsCapability = createSettingsCapability(link)
export const tokensCapability = createTokensCapability(link)
export const activityCapability = createActivityCapability(link)
export const ordersCapability = createOrdersCapability(link)
