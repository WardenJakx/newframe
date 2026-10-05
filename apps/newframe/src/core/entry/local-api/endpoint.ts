/** Shared by the desktop listener and its local worker clients. */
export function localApiPort() {
  return process.env.NEWFRAME_VISUAL_HARNESS === 'true'
    ? Number(process.env.NEWFRAME_HARNESS_RPC_PORT ?? 1249)
    : 1248
}
