import type { TrayProjectionRole } from '../state-sync/contract/projections.ts'

// Trusted, transport-neutral tray identity. This remains private to main;
// tray schemas expose only the safe operation record.
export interface OperationOwner {
  clientType: TrayProjectionRole
  windowInstanceId: string
}

export interface OperationReference {
  owner: OperationOwner
  id: string
  type: string
}
