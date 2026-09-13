import type {
  CommandMap,
  CommandResult,
  QueryMap,
  QueryResultMap,
  ResultForQuery
} from '../../../app/contracts/operations'
import type { NewframeHost } from '../../../platform/ipc/contract/ipc'
import type { ClipboardCapability } from '../../../shared/renderer/capabilities'

type WithoutType<TInput> = TInput extends { type: string } ? Omit<TInput, 'type'> : never
type CommandInput<TType extends keyof CommandMap> = WithoutType<CommandMap[TType]>

export interface AccountsCapability extends ClipboardCapability {
  updateAccount(input: CommandInput<'account.update'>): Promise<CommandResult>
  selectAccount(input: CommandInput<'account.select'>): Promise<CommandResult>
  removeAccount(input: CommandInput<'account.remove'>): Promise<CommandResult>
  revokeAccountAgentSessions(input: CommandInput<'account.agent-sessions-revoke'>): Promise<CommandResult>
  exportAccountPrivateKey(
    input: Omit<QueryMap['account.private-key-export'], 'type'>
  ): Promise<QueryResultMap['account.private-key-export']>

  selectProfile(input: CommandInput<'profile.select'>): Promise<CommandResult>
  createProfile(input: CommandInput<'profile.create'>): Promise<CommandResult>
  updateProfile(input: CommandInput<'profile.update'>): Promise<CommandResult>
  deleteProfile(input: CommandInput<'profile.delete'>): Promise<CommandResult>
  listMovableProfileAccounts(): Promise<QueryResultMap['profile.movable-accounts']>

  inspectAddressChainUsage(
    input: Omit<QueryMap['address.chain-usage'], 'type'>
  ): Promise<QueryResultMap['address.chain-usage']>
  getSecurityStatus(): Promise<QueryResultMap['security.status']>
  locateKeystore(): Promise<QueryResultMap['keystore.locate']>
  generateSeed(): Promise<QueryResultMap['seed.generate']>
  createAccount(input: CommandInput<'account.create'>): Promise<CommandResult>
  discoverSafeNetworks(address: string): Promise<QueryResultMap['safe.discover']>
  importSigner(input: CommandInput<'signer.import'>): Promise<CommandResult>

  startSignerSession(input: CommandInput<'signer.session-start'>): Promise<CommandResult>
  finishSignerSession(input: CommandInput<'signer.session-finish'>): Promise<CommandResult>
  refreshSigner(input: CommandInput<'signer.refresh'>): Promise<CommandResult>
  disconnectSigner(input: CommandInput<'signer.disconnect'>): Promise<CommandResult>
  inputSignerSession(input: CommandInput<'signer.session-input'>): Promise<CommandResult>
  sessionFrames(
    input: Omit<QueryMap['signer.session-frames'], 'type'>
  ): Promise<ResultForQuery<QueryMap['signer.session-frames']>>

  writeClipboard(input: CommandInput<'clipboard.write'>): Promise<CommandResult>
}

type AccountsHost = Pick<NewframeHost, 'executeCommand' | 'executeQuery'>

export function createAccountsCapability(host: AccountsHost): AccountsCapability {
  return {
    updateAccount: (input) => host.executeCommand({ type: 'account.update', ...input }),
    selectAccount: (input) => host.executeCommand({ type: 'account.select', ...input }),
    removeAccount: (input) => host.executeCommand({ type: 'account.remove', ...input }),
    revokeAccountAgentSessions: (input) =>
      host.executeCommand({ type: 'account.agent-sessions-revoke', ...input }),
    exportAccountPrivateKey: (input) => host.executeQuery({ type: 'account.private-key-export', ...input }),

    selectProfile: (input) => host.executeCommand({ type: 'profile.select', ...input }),
    createProfile: (input) => host.executeCommand({ type: 'profile.create', ...input }),
    updateProfile: (input) => host.executeCommand({ type: 'profile.update', ...input }),
    deleteProfile: (input) => host.executeCommand({ type: 'profile.delete', ...input }),
    listMovableProfileAccounts: () => host.executeQuery({ type: 'profile.movable-accounts' }),

    inspectAddressChainUsage: (input) => host.executeQuery({ type: 'address.chain-usage', ...input }),
    getSecurityStatus: () => host.executeQuery({ type: 'security.status' }),
    locateKeystore: () => host.executeQuery({ type: 'keystore.locate' }),
    generateSeed: () => host.executeQuery({ type: 'seed.generate' }),
    createAccount: (input) => host.executeCommand({ type: 'account.create', ...input }),
    discoverSafeNetworks: async (address) => {
      const result = await host.executeQuery({ type: 'safe.discover', address })
      if (!Array.isArray(result)) throw new Error(result.message || 'Could not load Safe networks')
      return result
    },
    importSigner: (input) => host.executeCommand({ type: 'signer.import', ...input }),

    startSignerSession: (input) => host.executeCommand({ type: 'signer.session-start', ...input }),
    finishSignerSession: (input) => host.executeCommand({ type: 'signer.session-finish', ...input }),
    refreshSigner: (input) => host.executeCommand({ type: 'signer.refresh', ...input }),
    disconnectSigner: (input) => host.executeCommand({ type: 'signer.disconnect', ...input }),
    inputSignerSession: (input) => host.executeCommand({ type: 'signer.session-input', ...input }),
    sessionFrames: (input) => host.executeQuery({ type: 'signer.session-frames', ...input }),

    writeClipboard: (input) => host.executeCommand({ type: 'clipboard.write', ...input }),
    writeText: (text) => host.executeCommand({ type: 'clipboard.write', text })
  }
}

export function selectAccountAndClose(
  capability: Pick<AccountsCapability, 'selectAccount'>,
  accountId: string,
  currentAccountId: string,
  onClose: () => void
) {
  onClose()
  if (accountId !== currentAccountId) void capability.selectAccount({ accountId }).catch(() => {})
}
