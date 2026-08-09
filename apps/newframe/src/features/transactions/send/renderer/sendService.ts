import link from '../../../../platform/ipc/renderer/link'

export function closeSend() {
  void link.executeCommand({ type: 'sidetray.close' })
}
