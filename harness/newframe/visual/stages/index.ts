import type { VisualStage } from '../types.ts'
import { activityStage } from './activity.ts'
import { anvilPositionsStage } from './anvil-positions.ts'
import { harnessAccountStage } from './harness-account.ts'
import { lockScreenStage } from './lock-screen.ts'
import { networkOnboardingStage } from './network-onboarding.ts'
import { resetStateStage } from './reset-state.ts'
import { sendStage } from './send.ts'
import { tradeLimitStage } from './trade-limit.ts'
import { tradeMarketStage } from './trade-market.ts'
import { tradeTicketStage } from './trade-ticket.ts'
import { trayOverlaysStage } from './tray-overlays.ts'
import { trayReadinessStage } from './tray-readiness.ts'
import { unlockStage } from './unlock.ts'
import { unlockedHomeStage } from './unlocked-home.ts'
import { usdcIntegrationStage } from './usdc-integration.ts'
import { vitalikPositionsStage } from './vitalik-positions.ts'

// Adding a visual surface only requires a stage file and one registration here.
export const visualStages: VisualStage[] = [
  lockScreenStage,
  unlockStage,
  trayReadinessStage,
  resetStateStage,
  unlockedHomeStage,
  trayOverlaysStage,
  vitalikPositionsStage,
  harnessAccountStage,
  networkOnboardingStage,
  anvilPositionsStage,
  tradeTicketStage,
  tradeMarketStage,
  tradeLimitStage,
  sendStage,
  usdcIntegrationStage,
  activityStage
]
