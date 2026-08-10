import type { CommandMap, CommandResult, QueryMap, QueryResultMap } from '../../../app/contracts/operations'
import type { NewframeHost } from '../../../platform/ipc/contract/ipc'
import type { ClipboardCapability } from '../../../shared/renderer/capabilities'

type WithoutType<TInput> = TInput extends { type: string } ? Omit<TInput, 'type'> : never
type CommandInput<TType extends keyof CommandMap> = WithoutType<CommandMap[TType]>

export interface AccountsCapability extends ClipboardCapability {
  reorderAccount(input: CommandInput<'account.reorder'>): Promise<CommandResult>
  selectAccount(input: CommandInput<'account.select'>): Promise<CommandResult>
  renameAccount(input: CommandInput<'account.rename'>): Promise<CommandResult>
  removeAccount(input: CommandInput<'account.remove'>): Promise<CommandResult>
  moveAccountToProfile(input: CommandInput<'account.profile-move'>): Promise<CommandResult>
  setAccountAgentAccess(input: CommandInput<'account.agent-access-set'>): Promise<CommandResult>
  revokeAccountAgentSessions(input: CommandInput<'account.agent-sessions-revoke'>): Promise<CommandResult>
  exportAccountPrivateKey(
    input: Omit<QueryMap['account.private-key-export'], 'type'>
  ): Promise<QueryResultMap['account.private-key-export']>

  selectProfile(input: CommandInput<'profile.select'>): Promise<CommandResult>
  createProfile(input: CommandInput<'profile.create'>): Promise<CommandResult>
  renameProfile(input: CommandInput<'profile.rename'>): Promise<CommandResult>
  deleteProfile(input: CommandInput<'profile.delete'>): Promise<CommandResult>
  listMovableProfileAccounts(): Promise<QueryResultMap['profile.movable-accounts']>

  inspectAddressChainUsage(
    input: Omit<QueryMap['address.chain-usage'], 'type'>
  ): Promise<QueryResultMap['address.chain-usage']>
  getSecurityStatus(): Promise<QueryResultMap['security.status']>
  locateKeystore(): Promise<QueryResultMap['keystore.locate']>
  generateSeed(): Promise<QueryResultMap['seed.generate']>
  addAccountFromSigner(input: CommandInput<'account.add-from-signer'>): Promise<CommandResult>
  addWatchAccount(input: CommandInput<'account.watch-add'>): Promise<CommandResult>
  importSigner(input: CommandInput<'signer.import'>): Promise<CommandResult>

  startHardwareSession(input: CommandInput<'signer.hardware-session-start'>): Promise<CommandResult>
  finishHardwareSession(input: CommandInput<'signer.hardware-session-finish'>): Promise<CommandResult>
  reloadSigner(input: CommandInput<'signer.reload'>): Promise<CommandResult>
  disconnectSigner(input: CommandInput<'signer.disconnect'>): Promise<CommandResult>
  loadLedgerAccounts(input: CommandInput<'signer.ledger-accounts-load'>): Promise<CommandResult>
  submitTrezorInput(input: CommandInput<'signer.trezor-input'>): Promise<CommandResult>
  createLatticeSigner(input: CommandInput<'signer.lattice-create'>): Promise<CommandResult>
  pairLattice(input: CommandInput<'signer.lattice-pair'>): Promise<CommandResult>

  writeClipboard(input: CommandInput<'clipboard.write'>): Promise<CommandResult>
}

type AccountsHost = Pick<NewframeHost, 'executeCommand' | 'executeQuery'>

export function createAccountsCapability(host: AccountsHost): AccountsCapability {
  return {
    reorderAccount: (input) => host.executeCommand({ type: 'account.reorder', ...input }),
    selectAccount: (input) => host.executeCommand({ type: 'account.select', ...input }),
    renameAccount: (input) => host.executeCommand({ type: 'account.rename', ...input }),
    removeAccount: (input) => host.executeCommand({ type: 'account.remove', ...input }),
    moveAccountToProfile: (input) => host.executeCommand({ type: 'account.profile-move', ...input }),
    setAccountAgentAccess: (input) => host.executeCommand({ type: 'account.agent-access-set', ...input }),
    revokeAccountAgentSessions: (input) =>
      host.executeCommand({ type: 'account.agent-sessions-revoke', ...input }),
    exportAccountPrivateKey: (input) => host.executeQuery({ type: 'account.private-key-export', ...input }),

    selectProfile: (input) => host.executeCommand({ type: 'profile.select', ...input }),
    createProfile: (input) => host.executeCommand({ type: 'profile.create', ...input }),
    renameProfile: (input) => host.executeCommand({ type: 'profile.rename', ...input }),
    deleteProfile: (input) => host.executeCommand({ type: 'profile.delete', ...input }),
    listMovableProfileAccounts: () => host.executeQuery({ type: 'profile.movable-accounts' }),

    inspectAddressChainUsage: (input) => host.executeQuery({ type: 'address.chain-usage', ...input }),
    getSecurityStatus: () => host.executeQuery({ type: 'security.status' }),
    locateKeystore: () => host.executeQuery({ type: 'keystore.locate' }),
    generateSeed: () => host.executeQuery({ type: 'seed.generate' }),
    addAccountFromSigner: (input) => host.executeCommand({ type: 'account.add-from-signer', ...input }),
    addWatchAccount: (input) => host.executeCommand({ type: 'account.watch-add', ...input }),
    importSigner: (input) => host.executeCommand({ type: 'signer.import', ...input }),

    startHardwareSession: (input) => host.executeCommand({ type: 'signer.hardware-session-start', ...input }),
    finishHardwareSession: (input) =>
      host.executeCommand({ type: 'signer.hardware-session-finish', ...input }),
    reloadSigner: (input) => host.executeCommand({ type: 'signer.reload', ...input }),
    disconnectSigner: (input) => host.executeCommand({ type: 'signer.disconnect', ...input }),
    loadLedgerAccounts: (input) => host.executeCommand({ type: 'signer.ledger-accounts-load', ...input }),
    submitTrezorInput: (input) => host.executeCommand({ type: 'signer.trezor-input', ...input }),
    createLatticeSigner: (input) => host.executeCommand({ type: 'signer.lattice-create', ...input }),
    pairLattice: (input) => host.executeCommand({ type: 'signer.lattice-pair', ...input }),

    writeClipboard: (input) => host.executeCommand({ type: 'clipboard.write', ...input }),
    writeText: (text) => host.executeCommand({ type: 'clipboard.write', text })
  }
}
