import type { VisualHarnessContext, VisualStage } from '../visual/types.ts'
import type { ExtensionBrowser } from './browser.ts'

export type ExtensionHarnessContext = VisualHarnessContext & { extension: ExtensionBrowser }

export type ExtensionStage = VisualStage<ExtensionHarnessContext>
