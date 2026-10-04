import type { RendererProjection } from '@newframe/schema/projections'

// Trusted, transport-neutral renderer identity. This remains private to main;
// renderer schemas expose only the safe operation record.
export interface OperationOwner {
  clientType: RendererProjection
  windowInstanceId: string
}

export interface OperationReference {
  owner: OperationOwner
  id: string
  type: string
}
