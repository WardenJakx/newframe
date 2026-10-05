import { harnessAccountStage } from '../../visual/stages/harness-account.ts'
import { harnessSignerStage } from '../../visual/stages/harness-signer.ts'
import { resetStateStage } from '../../visual/stages/reset-state.ts'
import { unlockStage } from '../../visual/stages/unlock.ts'
import { vitalikAccountStage } from '../../visual/stages/vitalik-account.ts'
import type { VisualSuite } from '../../visual/types.ts'
import { ExtensionBrowser } from '../browser.ts'
import type { ExtensionHarnessContext } from '../types.ts'
import { dappConnectStage } from './dapp-connect.ts'
import { dappSignsStage } from './dapp-signs.ts'
import { dappTransactionsStage } from './dapp-transactions.ts'
import { desktopSelectsUnsharedAccountStage } from './desktop-selects-unshared-account.ts'
import { extensionConnectStage } from './extension-connect.ts'
import { extensionSharesAnotherAccountStage } from './extension-shares-another-account.ts'

/** The real extension in Chromium between a scripted dapp and the desktop app. */
export const extensionSuite: VisualSuite<ExtensionHarnessContext> = {
  stages: [
    unlockStage,
    resetStateStage,
    harnessSignerStage,
    vitalikAccountStage,
    harnessAccountStage,
    extensionConnectStage,
    dappConnectStage,
    desktopSelectsUnsharedAccountStage,
    extensionSharesAnotherAccountStage,
    dappSignsStage,
    dappTransactionsStage
  ],
  context: (desktop) => ({ ...desktop, extension: new ExtensionBrowser(desktop.runtime) })
}
