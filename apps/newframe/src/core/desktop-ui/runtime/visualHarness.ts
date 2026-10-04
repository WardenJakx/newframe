/** The visual harness runs on the developer's desktop and must never be seen, focused, or clicked. */
export const isVisualHarness =
  process.env.NEWFRAME_VISUAL_HARNESS === 'true' && process.env.FRAME_PROFILE === 'dev'

/** A fixed virtual display, so harness screenshots do not depend on the host's monitors. */
export const visualHarnessWorkArea = { x: 0, y: 0, width: 1440, height: 900 }
