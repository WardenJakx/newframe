import type { CommandMap, QueryResultMap } from '../../../../app/contracts/operations.js'
import type { OperationOwner, OperationReference } from '../../../../platform/operations/types.js'
import type { OperationService } from '../../../../platform/operations/service.js'
import type { SigningUiContext } from '../../../../platform/signing/signers/Signer/index.js'
import type {
  AirGapPublicAccount,
  AirGapRequestReference
} from '../../../../platform/signing/domain/airgap.js'

interface ScanAttempt {
  receive(frame: string): AirGapPublicAccount | undefined
}
export interface AirGapServicePorts {
  operations: OperationService
  createPairScanner(): ScanAttempt
  addPublicAccount(account: AirGapPublicAccount): string
  getRequest(reference: AirGapRequestReference, owner: OperationOwner): string[] | undefined
  scan(reference: AirGapRequestReference, owner: OperationOwner, frame: string): Promise<boolean>
  cancel(reference: AirGapRequestReference, owner: OperationOwner): boolean
  rejectRequest(requestId: string): boolean
}
const type = 'signer.airgap-pair'
const sameOwner = (a: OperationOwner, b: OperationOwner) =>
  a.clientType === b.clientType && a.windowInstanceId === b.windowInstanceId
export function createAirGapService(ports: AirGapServicePorts) {
  const scans = new Map<string, { reference: OperationReference; scanner: ScanAttempt; dispose(): void }>()
  let disposed = false
  const release = (id: string) => {
    const scan = scans.get(id)
    scans.delete(id)
    scan?.dispose()
    return scan
  }
  const cancelPair = (id: string, owner: OperationOwner) => {
    const reference = { id, owner, type }
    if (!ports.operations.lookup(reference)) return false
    if (scans.get(id)?.reference.owner && sameOwner(scans.get(id)!.reference.owner, owner)) release(id)
    ports.operations.complete(reference, 'cancelled')
    return true
  }
  return {
    pairStart(command: CommandMap['signer.airgap-pair-start'], context: SigningUiContext) {
      if (disposed || context.owner.clientType !== 'wallet-ui' || !context.isOwnerActive()) return false
      const reference = { id: command.operationId, owner: context.owner, type }
      if (ports.operations.lookup(reference)) return true
      for (const scan of scans.values())
        if (sameOwner(scan.reference.owner, context.owner)) cancelPair(scan.reference.id, context.owner)
      ports.operations.start({ ...reference, phase: 'scanning' })
      const scan = { reference, scanner: ports.createPairScanner(), dispose: () => {} }
      scans.set(reference.id, scan)
      const unsubscribe = context.subscribeOwnerDisposed(() => cancelPair(reference.id, context.owner))
      if (scans.get(reference.id) !== scan) unsubscribe()
      else scan.dispose = unsubscribe
      return true
    },
    pairScan(command: CommandMap['signer.airgap-pair-scan'], owner: OperationOwner) {
      const scan = scans.get(command.operationId)
      if (!scan || !sameOwner(scan.reference.owner, owner)) return false
      let account: AirGapPublicAccount | undefined
      try {
        account = scan.scanner.receive(command.frame)
      } catch {
        throw new Error('Invalid AirGap export. Scan the Ethereum public account QR again.')
      }
      if (!account) return true
      try {
        const signerId = ports.addPublicAccount(account)
        ports.operations.advance(scan.reference, { entityRefs: [{ type: 'signer', id: signerId }] })
        ports.operations.complete(scan.reference, 'paired')
      } catch (error) {
        ports.operations.fail(scan.reference, { message: 'Could not save the AirGap account.' })
        throw error
      } finally {
        release(command.operationId)
      }
      return true
    },
    pairCancel(command: CommandMap['signer.airgap-pair-cancel'], owner: OperationOwner) {
      return cancelPair(command.operationId, owner)
    },
    request(
      reference: AirGapRequestReference,
      owner: OperationOwner
    ): QueryResultMap['signer.airgap-request'] {
      if (disposed) return { ok: false, error: 'unavailable' }
      const frames = ports.getRequest(reference, owner)
      return frames ? { ok: true, frames } : { ok: false, error: 'not_found' }
    },
    scan(command: CommandMap['signer.airgap-scan'], owner: OperationOwner) {
      return disposed ? false : ports.scan(command, owner, command.frame)
    },
    cancel(reference: AirGapRequestReference, owner: OperationOwner) {
      if (!disposed && ports.cancel(reference, owner)) ports.rejectRequest(reference.requestId)
      return true
    },
    dispose() {
      if (disposed) return
      disposed = true
      for (const scan of scans.values()) cancelPair(scan.reference.id, scan.reference.owner)
    }
  }
}
export type AirGapService = ReturnType<typeof createAirGapService>
