import { mock } from 'bun:test'

import type { CommandResult } from '../../../app/contracts/operations'
import type { AccountsCapability } from './accountsCapability'

const acknowledged = <TInput>() => mock(async (_input: TInput): Promise<CommandResult> => ({ ok: true }))

type CapabilityResult<TMethod extends (...args: never[]) => Promise<unknown>> = Awaited<ReturnType<TMethod>>

export function createAccountsCapabilityFake() {
  return {
    reorderAccount: acknowledged<Parameters<AccountsCapability['reorderAccount']>[0]>(),
    selectAccount: acknowledged<Parameters<AccountsCapability['selectAccount']>[0]>(),
    renameAccount: acknowledged<Parameters<AccountsCapability['renameAccount']>[0]>(),
    removeAccount: acknowledged<Parameters<AccountsCapability['removeAccount']>[0]>(),
    moveAccountToProfile: acknowledged<Parameters<AccountsCapability['moveAccountToProfile']>[0]>(),
    setAccountAgentAccess: acknowledged<Parameters<AccountsCapability['setAccountAgentAccess']>[0]>(),
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
    renameProfile: acknowledged<Parameters<AccountsCapability['renameProfile']>[0]>(),
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
    getSecurityStatus: mock(
      async (): Promise<CapabilityResult<AccountsCapability['getSecurityStatus']>> => ({
        ok: true,
        locked: false,
        vaultExists: true,
        biometricUnlockEnabled: false,
        biometricAvailable: false,
        biometrics: { enabled: false, method: '', nativeAvailable: false }
      })
    ),
    locateKeystore: mock(
      async (): Promise<CapabilityResult<AccountsCapability['locateKeystore']>> => ({
        ok: false,
        error: 'not_found'
      })
    ),
    generateSeed: mock(
      async (): Promise<CapabilityResult<AccountsCapability['generateSeed']>> => ({
        ok: false,
        error: 'operation_failed'
      })
    ),
    addAccountFromSigner: acknowledged<Parameters<AccountsCapability['addAccountFromSigner']>[0]>(),
    addWatchAccount: acknowledged<Parameters<AccountsCapability['addWatchAccount']>[0]>(),
    importSigner: acknowledged<Parameters<AccountsCapability['importSigner']>[0]>(),
    startHardwareSession: acknowledged<Parameters<AccountsCapability['startHardwareSession']>[0]>(),
    finishHardwareSession: acknowledged<Parameters<AccountsCapability['finishHardwareSession']>[0]>(),
    reloadSigner: acknowledged<Parameters<AccountsCapability['reloadSigner']>[0]>(),
    disconnectSigner: acknowledged<Parameters<AccountsCapability['disconnectSigner']>[0]>(),
    loadLedgerAccounts: acknowledged<Parameters<AccountsCapability['loadLedgerAccounts']>[0]>(),
    submitTrezorInput: acknowledged<Parameters<AccountsCapability['submitTrezorInput']>[0]>(),
    createLatticeSigner: acknowledged<Parameters<AccountsCapability['createLatticeSigner']>[0]>(),
    pairLattice: acknowledged<Parameters<AccountsCapability['pairLattice']>[0]>(),
    writeClipboard: acknowledged<Parameters<AccountsCapability['writeClipboard']>[0]>(),
    writeText: mock<AccountsCapability['writeText']>(async () => ({ ok: true }))
  } satisfies AccountsCapability
}

export type AccountsCapabilityFake = ReturnType<typeof createAccountsCapabilityFake>
