import link from '../../shared/link'

export function closeSend() {
  void link.executeCommand({ type: 'sidetray.close' })
}
