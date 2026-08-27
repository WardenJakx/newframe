import type { ConnectionStatus } from '../frameState'

export function frameConnectionPresentation(connectionStatus: ConnectionStatus) {
  if (connectionStatus === 'connected') {
    return { connected: true, label: 'Newframe Connected', tone: 'success' as const }
  }

  if (connectionStatus === 'extension-approval-pending') {
    return { connected: false, label: 'Approval Needed', tone: 'warning' as const }
  }

  return { connected: false, label: 'Newframe Not Running', tone: 'danger' as const }
}

export function siteConnectionPresentation(siteConnected: boolean, address: string) {
  if (siteConnected) {
    return { label: 'Connected wallet', tone: 'success' as const, value: address }
  }

  if (address) {
    return {
      label: 'Approval needed',
      tone: 'warning' as const,
      value: 'Approve this site in Newframe'
    }
  }

  return {
    label: 'No wallet selected',
    tone: 'danger' as const,
    value: 'Open Newframe to select a wallet'
  }
}
