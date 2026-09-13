import { mock } from 'bun:test'

import type { CommandResult } from '../../../app/contracts/operations'
import type { AccountsCapability } from './accountsCapability'

const acknowledged = <TInput>() => mock(async (_input: TInput): Promise<CommandResult> => ({ ok: true }))

type CapabilityResult<TMethod extends (...args: never[]) => Promise<unknown>> = Awaited<ReturnType<TMethod>>

export function createAccountsCapabilityFake() {
  return {
    updateAccount: acknowledged<Parameters<AccountsCapability['updateAccount']>[0]>(),
    selectAccount: acknowledged<Parameters<AccountsCapability['selectAccount']>[0]>(),
    removeAccount: acknowledged<Parameters<AccountsCapability['removeAccount']>[0]>(),
    revokeAccountAgentSessions:
      acknowledged<Parameters<AccountsCapability['revokeAccountAgentSessions']>[0]>(),
    exportAccountPrivateKey: mock(
      async (
        _input: Parameters<AccountsCapability['exportAccountPrivateKey']>[0]
      ): Promise<CapabilityResult<AccountsCapability['exportAccountPrivateKey']>> => ({
        ok: false,
        error: 'export_failed'
      })
    ),
    selectProfile: acknowledged<Parameters<AccountsCapability['selectProfile']>[0]>(),
    createProfile: acknowledged<Parameters<AccountsCapability['createProfile']>[0]>(),
    updateProfile: acknowledged<Parameters<AccountsCapability['updateProfile']>[0]>(),
    deleteProfile: acknowledged<Parameters<AccountsCapability['deleteProfile']>[0]>(),
    listMovableProfileAccounts: mock(
      async (): Promise<CapabilityResult<AccountsCapability['listMovableProfileAccounts']>> => ({
        ok: true,
        accounts: []
      })
    ),
    inspectAddressChainUsage: mock(
      async (
        _input: Parameters<AccountsCapability['inspectAddressChainUsage']>[0]
      ): Promise<CapabilityResult<AccountsCapability['inspectAddressChainUsage']>> => ({
        ok: true,
        usage: []
      })
    ),
    getSecurityStatus: mock(async (): Promise<CapabilityResult<AccountsCapability['getSecurityStatus']>> => ({
      ok: true,
      locked: false,
      vaultExists: true,
      biometricUnlockEnabled: false,
      biometricAvailable: false,
      biometrics: { enabled: false, method: '', nativeAvailable: false }
    })),
    locateKeystore: mock(async (): Promise<CapabilityResult<AccountsCapability['locateKeystore']>> => ({
      ok: false,
      error: 'not_found'
    })),
    generateSeed: mock(async (): Promise<CapabilityResult<AccountsCapability['generateSeed']>> => ({
      ok: false,
      error: 'operation_failed'
    })),
    createAccount: acknowledged<Parameters<AccountsCapability['createAccount']>[0]>(),
    discoverSafeNetworks: mock(
      async (_address: string): Promise<CapabilityResult<AccountsCapability['discoverSafeNetworks']>> => []
    ),
    importSigner: acknowledged<Parameters<AccountsCapability['importSigner']>[0]>(),
    startSignerSession: acknowledged<Parameters<AccountsCapability['startSignerSession']>[0]>(),
    finishSignerSession: acknowledged<Parameters<AccountsCapability['finishSignerSession']>[0]>(),
    refreshSigner: acknowledged<Parameters<AccountsCapability['refreshSigner']>[0]>(),
    disconnectSigner: acknowledged<Parameters<AccountsCapability['disconnectSigner']>[0]>(),
    inputSignerSession: acknowledged<Parameters<AccountsCapability['inputSignerSession']>[0]>(),
    sessionFrames: mock(
      async (
        _input: Parameters<AccountsCapability['sessionFrames']>[0]
      ): Promise<CapabilityResult<AccountsCapability['sessionFrames']>> => ({ ok: false, error: 'not_found' })
    ),
    writeClipboard: acknowledged<Parameters<AccountsCapability['writeClipboard']>[0]>(),
    writeText: mock<AccountsCapability['writeText']>(async () => ({ ok: true }))
  } satisfies AccountsCapability
}

export type AccountsCapabilityFake = ReturnType<typeof createAccountsCapabilityFake>
