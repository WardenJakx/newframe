/** Browser sender identity identifies the requesting frame, including opaque origins. */
export function requestOriginFromSender(sender: { origin?: string; url?: string }): string {
  if (sender.origin !== undefined) {
    return sender.origin
  }
  try {
    return sender.url ? new URL(sender.url).origin : ''
  } catch {
    return ''
  }
}
