import type { CommandMap, CommandResult, QueryMap, ResultForQuery } from '../../../app/contracts/operations'
import type { NewframeHost } from '../../../platform/ipc/contract/ipc'
import {
  createWebAuthnBiometricCredential,
  isBiometricUserCanceledError,
  isWebAuthnBiometricsSupported,
  type WebAuthnEnrollment
} from './biometrics'

type WithoutType<T> = T extends { type: string } ? Omit<T, 'type'> : never
type Input<TType extends keyof CommandMap> = WithoutType<CommandMap[TType]>
type QueryInput<TType extends keyof QueryMap> = WithoutType<QueryMap[TType]>

export interface SecurityCapability {
  configure(input: Input<'security.configure'>): Promise<CommandResult>
  status(input: QueryInput<'security.status'>): Promise<ResultForQuery<QueryMap['security.status']>>
  unlock(input: Input<'security.unlock'>): Promise<CommandResult>
  lock(input: Input<'wallet.lock'>): Promise<CommandResult>
  reset(input: Input<'wallet.reset'>): Promise<CommandResult>
  createWebAuthnCredential(): Promise<WebAuthnEnrollment>
  isBiometricUserCanceled(error: unknown): boolean
  isWebAuthnSupported(): Promise<boolean>
}

export function createSecurityCapability(
  host: Pick<NewframeHost, 'executeCommand' | 'executeQuery'>
): SecurityCapability {
  return {
    configure: (input) => host.executeCommand({ type: 'security.configure', ...input }),
    status: (input) => host.executeQuery({ type: 'security.status', ...input }),
    unlock: (input) => host.executeCommand({ type: 'security.unlock', ...input }),
    lock: (input) => host.executeCommand({ type: 'wallet.lock', ...input }),
    reset: (input) => host.executeCommand({ type: 'wallet.reset', ...input }),
    createWebAuthnCredential: createWebAuthnBiometricCredential,
    isBiometricUserCanceled: isBiometricUserCanceledError,
    isWebAuthnSupported: isWebAuthnBiometricsSupported
  }
}
