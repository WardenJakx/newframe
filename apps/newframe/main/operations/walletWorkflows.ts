import { isAddress } from 'ethers'
import { v5 as uuidv5 } from 'uuid'

import type { Accounts } from '../accounts/index.js'
import type { Chains } from '../chains/index.js'
import Erc20Contract from '../contracts/erc20.js'
import type { FlashService } from '../flash/index.js'
import type { TokenDiscoveryProviderAccess } from '../portfolio/index.js'
import type { Provider } from '../provider/index.js'
import type { ProviderProxyConnection } from '../provider/proxy.js'
import {
  ReplacementType,
  type AccountRequest,
  type AccessRequest,
  type AddChainRequest,
  type AddTokenRequest,
  type PermitSignatureRequest,
  type TransactionRequest
} from '../../contracts/requests.js'
import type Signer from '../signers/Signer/index.js'
import type { Chain } from '../store/state/index.js'
import type { TrustedPrincipal } from '../authority.js'
import { ApprovalType } from '../../domain/request/approval.js'
import {
  buildSideTrayRoute,
  normalizeSideTrayFrameRequest,
  SIDE_TRAY_FRAME_ID
} from '../../domain/sideTray/index.js'
import { toTokenId } from '../../domain/token/index.js'
import {
  isSignatureRequest,
  isTransactionRequest,
  isTypedMessageSignatureRequest
} from '../../domain/request/index.js'
import {
  findUnavailableSigners,
  getSignerDisplayType,
  isHardwareSigner,
  isSignerReady
} from '../../domain/signer/index.js'
import { usesBaseFee } from '../../domain/transaction/index.js'
import { capitalize, randomLetters } from '../../domain/text.js'
import { toBigInt } from '../../domain/units.js'
import { resolveName, selectAccount } from './workflows.js'
import type { AccountTransactionPolicyPort } from '../features/transactions/accountPolicyPort.js'
import type { NameResolutionService } from '../nameResolution.js'
import type { RevealService } from '../reveal.js'
import { createSecurityService, type SecurityServicePorts } from '../features/security/service.js'
import { createSettingsService } from '../features/settings/service.js'
import type { CanonicalStore } from '../store/actions.js'
import type { AssetRateService } from '../features/assetRates/service.js'
import type {
  AccountAddFromSignerCommand,
  NetworkRequestResolveCommand,
  RequestTokenApprovalUpdateCommand,
  SignerImportCommand,
  SideTrayOpenCommand,
  TokenAddCommand,
  TrezorInputCommand,
  WalletToken,
  WarningToggleCommand
} from '../../contracts/operations.js'

type WorkflowCallback<T> = (error: unknown, value?: T) => void

export type WalletWorkflowSignerPort = SecurityServicePorts['signers'] & {
  createFromKeystore(
    keystore: string | { version: number },
    keystorePassword: string,
    password: string,
    callback: WorkflowCallback<Signer>
  ): void
  createFromPhrase(phrase: string, password: string, callback: WorkflowCallback<Signer>): void
  createFromPrivateKey(privateKey: string, password: string, callback: WorkflowCallback<Signer>): void
  exportAccountPrivateKey(
    address: string,
    password: string,
    callback: WorkflowCallback<{ type: string; value: string }>
  ): void
  get(id: string): Signer | undefined
  newPhrase(callback: WorkflowCallback<string>): void
  reload(id: string): void
  remove(id: string): void
}

export interface WalletWorkflowPlatformPorts {
  app: Pick<Electron.App, 'exit' | 'quit' | 'relaunch'>
  biometrics: SecurityServicePorts['biometrics']
  clipboard: Pick<Electron.Clipboard, 'writeText'>
  persistence: { clear(): void }
  signers: WalletWorkflowSignerPort
  updater: {
    dismissUpdate(): void
    fetchUpdate(): void
    quitAndInstall(): void
    updateReady: boolean
  }
  vault: SecurityServicePorts['vault'] & { exists(): boolean }
  windows: {
    handleTrayMouseout(): void
    refocusSideTray(frameId: string): void
  }
}

export interface WalletWorkflowDependencies {
  accounts: Accounts
  assetRateService: AssetRateService
  app: WalletWorkflowPlatformPorts['app']
  biometrics: WalletWorkflowPlatformPorts['biometrics']
  chains: Chains
  clipboard: Pick<Electron.Clipboard, 'writeText'>
  delay(ms: number): Promise<void>
  flashService: FlashService
  getTokenDiscoveryProvider: () => TokenDiscoveryProviderAccess
  inspectEnabled: boolean
  log: { warn(message: string, details?: unknown): void }
  nameResolution: NameResolutionService
  now(): number
  openBlockExplorer(chain: { id: number; type: 'ethereum' }, transactionHash?: string): void
  openExternal(url: string): void
  openFileDialog(): Promise<{ filePaths?: string[] } | undefined>
  persistence: WalletWorkflowPlatformPorts['persistence']
  provider: Provider
  proxy: ProviderProxyConnection
  randomBytes(size: number): { toString(encoding: 'hex'): string }
  readFile(path: string, encoding: 'utf8'): Promise<string>
  reveal: RevealService
  rpcMatchesChain(url: unknown, chainId: number): Promise<boolean>
  signers: WalletWorkflowPlatformPorts['signers']
  store: { getState(): CanonicalStore }
  transactionPolicy: AccountTransactionPolicyPort
  trezorBridge: {
    pinEntered(signerId: string, value: string): void
    passphraseEntered(signerId: string, value: string): void
    enterPassphraseOnDevice(signerId: string): void
  }
  updater: WalletWorkflowPlatformPorts['updater']
  vault: WalletWorkflowPlatformPorts['vault']
  windows: WalletWorkflowPlatformPorts['windows']
}

export type WalletWorkflowAdapters = Omit<
  WalletWorkflowDependencies,
  | 'accounts'
  | 'assetRateService'
  | 'chains'
  | 'flashService'
  | 'nameResolution'
  | 'provider'
  | 'proxy'
  | 'reveal'
  | 'store'
  | 'transactionPolicy'
>

function openTransactionExplorer(
  chainId: number,
  transactionHash: string | undefined,
  dependencies: WalletWorkflowDependencies
) {
  const chain = dependencies.store.getState().main.networks.ethereum[chainId]
  if (!chain) return false

  dependencies.openBlockExplorer({ id: chainId, type: 'ethereum' }, transactionHash)
  return true
}

async function lookupToken(
  address: string,
  chainId: number,
  provider: Provider,
  dependencies: WalletWorkflowDependencies
) {
  try {
    const token = await new Erc20Contract(address as Address, chainId, provider).getTokenData()
    if (!token.totalSupply || token.decimals === undefined) return

    return {
      decimals: token.decimals,
      name: token.name,
      symbol: token.symbol,
      totalSupply: token.totalSupply
    }
  } catch (error) {
    dependencies.log.warn('Could not load token data for contract', { address, chainId, error })
  }
}

function addressHasTransactions(address: string, chainId: number, chains: Chains) {
  return new Promise<boolean | null>((resolve) => {
    chains.send(
      {
        id: `address-usage:${chainId}:${address}`,
        jsonrpc: '2.0',
        method: 'eth_getTransactionCount',
        params: [address, 'latest']
      },
      (response) => {
        if (response.error) return resolve(null)

        try {
          resolve(BigInt(response.result) > 0n)
        } catch {
          resolve(null)
        }
      },
      { type: 'ethereum', id: chainId }
    )
  })
}

async function getAddressChainUsage(
  addresses: string[],
  chains: Chains,
  dependencies: WalletWorkflowDependencies
) {
  const enabledChainIds = Object.values(dependencies.store.getState().main.networks.ethereum)
    .filter((chain) => chain.on)
    .map((chain) => chain.id)
    .sort((a, b) => a - b)

  return Promise.all(
    addresses.map(async (address) => {
      const checks = await Promise.all(
        enabledChainIds.map(async (chainId) => ({
          chainId,
          used: await addressHasTransactions(address, chainId, chains)
        }))
      )

      return {
        address,
        chainIds: checks.filter((check) => check.used === true).map((check) => check.chainId),
        complete: checks.every((check) => check.used !== null)
      }
    })
  )
}

function currentRequest<T extends AccountRequest = AccountRequest>(requestId: string, accounts: Accounts) {
  return accounts.current()?.getRequest<T>(requestId)
}

function errorMessage(error: unknown) {
  if (typeof error === 'string') return error.slice(0, 1_000)
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message).slice(0, 1_000)
  }
  return 'The operation failed.'
}

function callbackResult<T>(run: (done: (error: unknown, value?: T) => void) => void) {
  return new Promise<T>((resolve, reject) => {
    run((error, value) => {
      if (error) return reject(error)
      if (value === undefined) return reject(new Error('Operation returned no result'))
      resolve(value)
    })
  })
}

function consumeHomeCommand(commandId: number, dependencies: WalletWorkflowDependencies) {
  const command = dependencies.store.getState().tray.homeCommand as { id: number } | null
  if (!command || command.id !== commandId) return false
  dependencies.store.getState().clearHomeCommand(commandId)
  return true
}

async function setNetworkPrimaryRpc(chainId: number, url: string, dependencies: WalletWorkflowDependencies) {
  if (!dependencies.store.getState().main.networks.ethereum[chainId]) return false
  if (!(await dependencies.rpcMatchesChain(url, chainId))) {
    throw new Error('The RPC endpoint returned a different chain ID.')
  }

  const state = dependencies.store.getState()
  state.setPrimaryCustom('ethereum', chainId, url)
  state.selectPrimary('ethereum', chainId, 'custom')
  state.toggleConnection('ethereum', chainId, 'primary', true)
  return true
}

function setNetworkActivation(chainId: number, enabled: boolean, dependencies: WalletWorkflowDependencies) {
  if (!dependencies.store.getState().main.networks.ethereum[chainId] || (chainId === 1 && !enabled)) {
    return false
  }
  dependencies.store.getState().activateNetwork('ethereum', chainId, enabled)
  return true
}

function updateNotification(
  notificationId: string,
  action: 'dismiss' | 'expire',
  dependencies: WalletWorkflowDependencies
) {
  const notification = dependencies.store.getState().view.notifications[notificationId]
  if (!notification) return false

  if (action === 'dismiss') dependencies.store.getState().dismissNotification(notificationId)
  else dependencies.store.getState().expireNotification(notificationId)
  return true
}

function clearPermission(
  accountId: string,
  originId: string | undefined,
  dependencies: WalletWorkflowDependencies
) {
  const state = dependencies.store.getState()
  const permissions = state.main.permissions[accountId]
  if (!state.main.accounts[accountId] || !permissions || (originId && !permissions[originId])) return false

  if (originId) state.revokePermission(accountId, originId)
  else state.clearPermissions(accountId)
  return true
}

function resetWallet(scope: 'saved-data' | 'all-settings-data', dependencies: WalletWorkflowDependencies) {
  dependencies.store.getState().resetSavedData()
  if (scope === 'saved-data') return

  dependencies.persistence.clear()
  if (dependencies.updater.updateReady) dependencies.updater.quitAndInstall()
  else {
    dependencies.app.relaunch()
    dependencies.app.exit(0)
  }
}

function quitApp(dependencies: WalletWorkflowDependencies) {
  dependencies.app.quit()
}

function addToken(command: TokenAddCommand, dependencies: WalletWorkflowDependencies) {
  dependencies.store.getState().upsertTokens([command.token], { custom: true, source: 'custom' })
  return true
}

function removeToken(
  token: Pick<WalletToken, 'address' | 'chainId'>,
  dependencies: WalletWorkflowDependencies
) {
  const state = dependencies.store.getState()
  const canonicalToken = state.main.tokens.byId[toTokenId(token)]
  if (!canonicalToken) return false

  state.removeCustomTokens([canonicalToken])
  return true
}

function removeOrigin(originId: string, accounts: Accounts, dependencies: WalletWorkflowDependencies) {
  if (!dependencies.store.getState().main.origins[originId]) return false

  accounts.removeRequests(originId)
  dependencies.store.getState().removeOrigin(originId)
  return true
}

function toggleWarning(warning: WarningToggleCommand['warning'], dependencies: WalletWorkflowDependencies) {
  const actions = {
    explorer: () => dependencies.store.getState().toggleExplorerWarning(),
    'gas-fee': () => dependencies.store.getState().toggleGasFeeWarning(),
    'signer-compatibility': () => dependencies.store.getState().toggleSignerCompatibilityWarning()
  }

  actions[warning]()
}

function removeNetwork(chainId: number, dependencies: WalletWorkflowDependencies) {
  const network = dependencies.store.getState().main.networks.ethereum[chainId]
  if (!network || chainId === 1) return false

  dependencies.store.getState().removeNetwork(network)
  return true
}

function submitTrezorInput(command: TrezorInputCommand, dependencies: WalletWorkflowDependencies) {
  const signer = dependencies.signers.get(command.signerId)
  if (!signer || signer.type !== 'trezor') return false

  if (command.input === 'pin') {
    dependencies.trezorBridge.pinEntered(command.signerId, command.value)
  }
  if (command.input === 'passphrase') {
    dependencies.trezorBridge.passphraseEntered(command.signerId, command.value)
  }
  if (command.input === 'device-passphrase') {
    dependencies.trezorBridge.enterPassphraseOnDevice(command.signerId)
  }
  return true
}

async function pairLattice(signerId: string, pairCode: string, dependencies: WalletWorkflowDependencies) {
  const signer = dependencies.signers.get(signerId)
  if (!signer || signer.type !== 'lattice' || !('pair' in signer) || typeof signer.pair !== 'function') {
    return false
  }

  await signer.pair(pairCode)
  return true
}

function removeAccount(
  address: string,
  removeSeedSigner: boolean,
  accounts: Accounts,
  dependencies: WalletWorkflowDependencies
) {
  const accountId = address.toLowerCase()
  const state = dependencies.store.getState()
  const account = state.main.accounts[accountId]
  if (!account) return false

  let seedSignerId = ''
  if (removeSeedSigner && account.signer) {
    const signer = dependencies.signers.get(account.signer)
    const hasAnotherAccount = Object.values(state.main.accounts).some(
      (candidate) => candidate.id !== accountId && candidate.signer === account.signer
    )
    if (signer?.type === 'seed' && !hasAnotherAccount) seedSignerId = signer.id
  }

  accounts.remove(accountId)
  if (seedSignerId) dependencies.signers.remove(seedSignerId)
  return true
}

function reorderAccounts(
  fromAccountId: string,
  toAccountId: string,
  dependencies: WalletWorkflowDependencies
) {
  const state = dependencies.store.getState()
  if (!state.main.accounts[fromAccountId] || !state.main.accounts[toAccountId]) return false
  state.reorderAccounts(fromAccountId, toAccountId)
  return true
}

function renameAccount(accountId: string, name: string, accounts: Accounts) {
  if (!accounts.get(accountId)) return false
  accounts.rename(accountId, name)
  return true
}

async function addAndSelectAccount(
  address: string,
  name: string,
  signerType: string,
  accounts: Accounts,
  provider: Provider
) {
  const accountId = address.toLowerCase()
  if (!accounts.get(accountId)) accounts.add(address, name, { type: signerType })
  await selectAccount(accountId, accounts, provider)
  return accountId
}

async function addAccountFromSigner(
  command: AccountAddFromSignerCommand,
  accounts: Accounts,
  provider: Provider,
  dependencies: WalletWorkflowDependencies
) {
  const signer = dependencies.signers.get(command.signerId)
  const address = signer?.addresses.find(
    (candidate) => candidate.toLowerCase() === command.address.toLowerCase()
  )
  if (!signer || !address) return

  const label = getSignerDisplayType(signer.type)
  return addAndSelectAccount(
    address,
    command.name || `${capitalize(label)} Account`,
    signer.type,
    accounts,
    provider
  )
}

async function addWatchAccount(
  addressOrName: string,
  name: string | undefined,
  accounts: Accounts,
  provider: Provider,
  nameResolution: NameResolutionService
) {
  const address = isAddress(addressOrName) ? addressOrName : await resolveName(addressOrName, nameResolution)
  if (!address || !isAddress(address)) return
  return addAndSelectAccount(address, name || 'Watch Account', 'Address', accounts, provider)
}

function createSigner(command: SignerImportCommand, dependencies: WalletWorkflowDependencies) {
  return callbackResult<Signer>((done) => {
    if (command.source === 'phrase') {
      dependencies.signers.createFromPhrase(command.phrase, command.framePassword, done)
    } else if (command.source === 'private-key') {
      dependencies.signers.createFromPrivateKey(command.privateKey, command.framePassword, done)
    } else {
      dependencies.signers.createFromKeystore(
        command.keystore,
        command.keystorePassword,
        command.framePassword,
        done
      )
    }
  })
}

async function importSigner(
  command: SignerImportCommand,
  accounts: Accounts,
  provider: Provider,
  dependencies: WalletWorkflowDependencies
) {
  const signer = await createSigner(command, dependencies)
  const address = signer.addresses[0]
  if (!address) throw new Error('No account address was created')
  return addAndSelectAccount(address, command.accountName || 'Hot Account', signer.type, accounts, provider)
}

function exportAccountPrivateKey(
  accountId: string,
  password: string,
  dependencies: WalletWorkflowDependencies
) {
  const account = dependencies.store.getState().main.accounts[accountId]
  if (!account) return

  return callbackResult<{ type: string; value: string }>((done) =>
    dependencies.signers.exportAccountPrivateKey(account.address, password, done)
  )
}

async function locateKeystore(dependencies: WalletWorkflowDependencies) {
  const selection = await dependencies.openFileDialog()
  const filePath = selection?.filePaths?.[0]
  if (!filePath) return

  const parsed = JSON.parse(await dependencies.readFile(filePath, 'utf8')) as Record<string, unknown>
  if (![1, 3].includes(Number(parsed.version))) throw new Error('Invalid keystore version')
  return parsed
}

function generateSeedPhrase(dependencies: WalletWorkflowDependencies) {
  return callbackResult<string>((done) => dependencies.signers.newPhrase(done))
}

function createLatticeSigner(deviceId: string, deviceName: string, dependencies: WalletWorkflowDependencies) {
  dependencies.store.getState().updateLattice(deviceId, {
    deviceId,
    baseUrl: 'https://signing.gridpl.us',
    endpointMode: 'default',
    paired: true,
    deviceName: (deviceName || 'GridPlus').substring(0, 14),
    tag: randomLetters(6),
    privKey: dependencies.randomBytes(32).toString('hex')
  })
  return `lattice-${deviceId}`
}

function disconnectSigner(signerId: string, dependencies: WalletWorkflowDependencies) {
  if (!dependencies.signers.get(signerId)) return false
  dependencies.signers.remove(signerId)
  return true
}

function openSideTray(command: SideTrayOpenCommand, dependencies: WalletWorkflowDependencies) {
  const state = dependencies.store.getState()
  if (command.chainId && !state.main.networks.ethereum[command.chainId]) return false

  const frame = normalizeSideTrayFrameRequest({
    id: SIDE_TRAY_FRAME_ID,
    route: buildSideTrayRoute(
      command.feature,
      command.assetId || '',
      command.feature === 'trade' ? command.chainId : undefined
    )
  })!
  const exists = state.main.frames[frame.id]
  state.setSideTray(frame)
  if (exists) dependencies.windows.refocusSideTray(frame.id)
  return true
}

const internalOriginName = 'newframe-internal'
const internalOriginId = uuidv5(internalOriginName, uuidv5.DNS)

function sendProviderRequest(payload: RPCRequestPayload, principal: TrustedPrincipal, provider: Provider) {
  return new Promise<RPCResponsePayload>((resolve) => provider.send(payload, resolve, principal))
}

async function cancelFlashOrder(
  orderId: string,
  principal: TrustedPrincipal,
  provider: Provider,
  flashService: FlashService,
  dependencies: WalletWorkflowDependencies
) {
  const state = dependencies.store.getState()
  const order = state.main.orders[orderId] as
    | { accountAddress?: string; account?: string; address?: string; chainId?: number | string }
    | undefined
  if (!order) return false

  const accountAddress = order.accountAddress || order.account || order.address || ''
  const currentAccount = state.main.accounts[state.main.currentAccount || '']
  if (!isAddress(accountAddress) || currentAccount?.address.toLowerCase() !== accountAddress.toLowerCase()) {
    return false
  }

  const chainId = Number(order.chainId)
  if (!Number.isInteger(chainId) || chainId <= 0 || !state.main.networks.ethereum[chainId]) return false

  state.initOrigin(internalOriginId, {
    name: internalOriginName,
    chain: { id: chainId, type: 'ethereum' }
  })

  const message = `Definitive Flash v1 — Cancel Order\nOrder: ${orderId}`
  const response = await sendProviderRequest(
    {
      id: dependencies.now(),
      jsonrpc: '2.0',
      method: 'personal_sign',
      chainId: `0x${chainId.toString(16)}`,
      params: [message, accountAddress],
      _origin: internalOriginId
    },
    principal,
    provider
  )
  if (response.error) throw new Error(errorMessage(response.error))
  if (typeof response.result !== 'string' || !/^0x[0-9a-fA-F]+$/.test(response.result)) {
    throw new Error('Cancel signature was not returned.')
  }

  await flashService.cancelOrder({ orderId, signature: response.result })
  return true
}

async function resolveNetworkRequest(
  command: NetworkRequestResolveCommand,
  accounts: Accounts,
  dependencies: WalletWorkflowDependencies
) {
  const state = dependencies.store.getState()
  const request = command.requestId ? currentRequest<AddChainRequest>(command.requestId, accounts) : undefined
  const currentHomeCommand = state.tray.homeCommand as {
    id: number
    data?: { chain?: Chain; newChain?: Chain }
  } | null
  const homeCommand = command.homeCommandId === currentHomeCommand?.id ? currentHomeCommand : undefined
  const chain =
    request?.type === 'addChain' ? request.chain : homeCommand?.data?.newChain || homeCommand?.data?.chain
  if (!chain) return false

  if (command.approved) {
    const chainId = Number(chain.id)
    const existing = state.main.networks.ethereum[chainId]
    if (existing) {
      state.activateNetwork('ethereum', chainId, true)
    } else {
      if (
        !(await dependencies.rpcMatchesChain((chain as Chain & { primaryRpc?: string }).primaryRpc, chainId))
      ) {
        throw new Error('The RPC endpoint returned a different chain ID.')
      }
      state.addNetwork(chain)
    }
    if (request) accounts.resolveRequest(request)
  } else if (request) {
    accounts.rejectRequest(request, { code: 4001, message: 'User rejected the request' })
  }

  if (homeCommand) state.clearHomeCommand(homeCommand.id)
  return true
}

async function refreshPortfolio(accounts: Accounts, dependencies: WalletWorkflowDependencies) {
  const state = dependencies.store.getState()
  const account = state.main.accounts[state.main.currentAccount || '']
  if (!account?.address) return false
  const address = account.address.toLowerCase() as Address
  const chainIds = Object.values(state.main.networks.ethereum)
    .filter((network) => network.on)
    .map((network) => network.id)
  const discovery = dependencies.getTokenDiscoveryProvider()

  if (discovery.ok) {
    try {
      const portfolio = await discovery.provider.getWalletPortfolio(address, chainIds, { sync: true })
      if (portfolio.tokens.length) {
        state.upsertTokens(portfolio.tokens, { account: address, source: 'portfolio' })
      }
      if (portfolio.balances.length) {
        state.setPortfolioBalances(address, portfolio.balances)
        state.accountTokensUpdated(address)
      }
      dependencies.assetRateService.observe('zerion', portfolio.assetRates)
    } catch (error) {
      dependencies.log.warn(`Could not refresh portfolio provider balances for ${address}`, error)
    }
  }

  accounts.refreshBalances(address)
  return true
}

function reloadSigner(signerId: string, dependencies: WalletWorkflowDependencies) {
  if (!dependencies.signers.get(signerId)) return false

  dependencies.signers.reload(signerId)
  return true
}

function loadLedgerAccounts(
  signerId: string,
  accountCount: number,
  dependencies: WalletWorkflowDependencies
) {
  const signer = dependencies.signers.get(signerId) as
    | (Signer & {
        accountLimit: number
        derivation?: string
        deriveAddresses: () => void
      })
    | undefined

  if (!signer || signer.type !== 'ledger') return false
  if (signer.derivation !== 'live' || accountCount <= signer.accountLimit) return true

  signer.accountLimit = accountCount
  signer.deriveAddresses()
  return true
}

function rejectRequest(requestId: string, accounts: Accounts) {
  const request = currentRequest(requestId, accounts)
  if (!request) return false

  accounts.rejectRequest(request, { code: 4001, message: 'User rejected the request' })
  return true
}

function resolveAccessRequest(requestId: string, approved: boolean, accounts: Accounts) {
  const request = currentRequest<AccessRequest>(requestId, accounts)
  if (request?.type !== 'access') return false

  accounts.setAccess(request, approved)
  return true
}

function resolveSwitchChainRequest(
  requestId: string,
  approved: boolean,
  accounts: Accounts,
  dependencies: WalletWorkflowDependencies
) {
  const request = currentRequest(requestId, accounts) as
    | (AccountRequest<'switchChain'> & { chain?: { id?: string | number; type?: string } })
    | undefined
  if (request?.type !== 'switchChain') return false

  if (approved) {
    const state = dependencies.store.getState()
    const chainId = Number(request.chain?.id)
    if (
      request.chain?.type !== 'ethereum' ||
      !Number.isInteger(chainId) ||
      !state.main.origins[request.origin] ||
      !state.main.networks.ethereum[chainId]
    ) {
      return false
    }
    state.switchOriginChain(request.origin, chainId, 'ethereum')
  }

  accounts.resolveRequest(request)
  return true
}

function clearOriginRequests(accountId: string, originId: string, accounts: Accounts) {
  if (!accounts.get(accountId)) return false

  accounts.clearRequestsByOrigin(accountId, originId)
  return true
}

function requestSignerCompatibility(
  requestId: string,
  accounts: Accounts,
  transactionPolicy: AccountTransactionPolicyPort,
  dependencies: WalletWorkflowDependencies
) {
  const account = accounts.current()
  const request = account?.getRequest(requestId)
  if (!account || !request) {
    return {
      ok: false as const,
      error: 'request_not_found' as const,
      message: 'Could not locate the request.'
    }
  }

  const signerSummaries = dependencies.store.getState().main.signers || {}
  const signer = account.signer ? signerSummaries[account.signer] : undefined
  if (!signer) {
    const unavailableSigners = findUnavailableSigners(
      account.lastSignerType,
      Object.values(signerSummaries) as Signer[]
    )
    const hardwareUnavailable = unavailableSigners.length > 0
    return {
      ok: false as const,
      error: hardwareUnavailable ? ('signer_unavailable' as const) : ('no_signer' as const),
      message: hardwareUnavailable ? 'The hardware signer is unavailable.' : 'No signer is available.',
      ...(hardwareUnavailable ? { signerIds: unavailableSigners.map(({ id }) => id) } : {})
    }
  }

  if (!isSignerReady(signer)) {
    const hardwareUnavailable = isHardwareSigner(signer)
    return {
      ok: false as const,
      error: hardwareUnavailable ? ('signer_unavailable' as const) : ('locked' as const),
      message: hardwareUnavailable ? 'The hardware signer is unavailable.' : 'Newframe is locked.',
      ...(hardwareUnavailable ? { signerIds: [signer.id] } : {})
    }
  }

  const compatibility =
    request.type === 'transaction'
      ? transactionPolicy.signerCompatibility((request as TransactionRequest).data, signer)
      : { signer: signer.type, tx: '', compatible: true }
  return { ok: true as const, compatibility }
}

function confirmRequestApproval(
  requestId: string,
  approvalType: 'approveOtherChain' | 'approveGasLimit',
  accounts: Accounts
) {
  const request = currentRequest<TransactionRequest>(requestId, accounts)
  if (request?.type !== 'transaction') return false

  const approval = request.approvals?.find((candidate) => candidate.type === approvalType)
  if (!approval || approval.approved) return false

  accounts.confirmRequestApproval(requestId, approvalType as ApprovalType, {})
  return true
}

function updateTokenApproval(command: RequestTokenApprovalUpdateCommand, accounts: Accounts) {
  if (command.requestKind === 'transaction') {
    const request = currentRequest<TransactionRequest>(command.requestId, accounts)
    const action = request?.recognizedActions?.find((candidate) => candidate.id === command.actionId)
    if (request?.type !== 'transaction' || !action) return false

    return accounts.updateRequest(command.requestId, { amount: command.amount }, command.actionId)
  }

  const request = currentRequest<PermitSignatureRequest>(command.requestId, accounts)
  if (request?.type !== 'signErc20Permit') return false

  return accounts.updateRequest(
    command.requestId,
    {
      typedMessage: {
        ...request.typedMessage,
        data: {
          ...request.typedMessage.data,
          message: { ...request.typedMessage.data.message, value: command.amount }
        }
      },
      permit: { ...request.permit, value: command.amount },
      tokenData: request.tokenData
    },
    'erc20:approve'
  )
}

function updateTransactionFee(
  requestId: string,
  field: 'baseFee' | 'priorityFee' | 'gasPrice' | 'gasLimit',
  value: string,
  accounts: Accounts
) {
  if (currentRequest(requestId, accounts)?.type !== 'transaction') return false

  const setters = {
    baseFee: accounts.setBaseFee.bind(accounts),
    priorityFee: accounts.setPriorityFee.bind(accounts),
    gasPrice: accounts.setGasPrice.bind(accounts),
    gasLimit: accounts.setGasLimit.bind(accounts)
  }
  setters[field](value, requestId, true)
  return true
}

function setTransactionFeeDefault(
  requestId: string,
  level: 'asap' | 'fast' | 'standard' | 'slow',
  accounts: Accounts,
  dependencies: WalletWorkflowDependencies
) {
  const request = currentRequest<TransactionRequest>(requestId, accounts)
  if (request?.type !== 'transaction') return false

  const state = dependencies.store.getState()
  const chainId = Number(request.data.chainId)
  const network = state.main.networks.ethereum[chainId]
  const gasPrice = state.main.networksMeta.ethereum[chainId]?.gas?.price
  const levelValue = gasPrice?.levels?.[level]
  if (!network || levelValue === undefined) return false

  state.setGasDefault('ethereum', chainId, level, levelValue)
  const multiplier = { asap: 150n, fast: 125n, standard: 100n, slow: 85n }[level]
  const scale = (value: bigint) => (value * multiplier) / 100n
  const toHex = (value: bigint) => `0x${value.toString(16)}`

  if (usesBaseFee(request.data)) {
    const currentPriority = toBigInt(request.data.maxPriorityFeePerGas) ?? 0n
    const currentMax = toBigInt(request.data.maxFeePerGas) ?? 0n
    const currentBase = currentMax > currentPriority ? currentMax - currentPriority : 0n
    const nextBase = scale(toBigInt(gasPrice.fees?.maxBaseFeePerGas) ?? currentBase)
    const nextPriority = scale(toBigInt(gasPrice.fees?.maxPriorityFeePerGas) ?? currentPriority)

    accounts.setPriorityFee(toHex(nextPriority), requestId, true)
    accounts.setBaseFee(toHex(nextBase), requestId, true)
  } else {
    const currentGasPrice = toBigInt(request.data.gasPrice) ?? 0n
    accounts.setGasPrice(toHex(toBigInt(levelValue) ?? scale(currentGasPrice)), requestId, true)
  }

  accounts.current()?.patchRequest<TransactionRequest>(requestId, (updatedRequest) => {
    updatedRequest.feesUpdatedByUser = false
  })

  return true
}

function adjustTransactionNonce(requestId: string, direction: -1 | 1, accounts: Accounts) {
  if (currentRequest(requestId, accounts)?.type !== 'transaction') return false
  accounts.adjustNonce(requestId, direction)
  return true
}

function resetTransactionNonce(requestId: string, accounts: Accounts) {
  if (currentRequest(requestId, accounts)?.type !== 'transaction') return false
  accounts.resetNonce(requestId)
  return true
}

async function dismissTransactionFeeNotice(requestId: string, accounts: Accounts) {
  if (currentRequest(requestId, accounts)?.type !== 'transaction') return false
  await new Promise<void>((resolve, reject) => {
    accounts.removeFeeUpdateNotice(requestId, (error) => (error ? reject(error) : resolve()))
  })
  return true
}

async function replaceTransaction(
  requestId: string,
  replacement: 'cancel' | 'speed',
  principal: TrustedPrincipal,
  accounts: Accounts,
  dependencies: WalletWorkflowDependencies
) {
  if (currentRequest(requestId, accounts)?.type !== 'transaction') return false

  dependencies.store.getState().navBack('panel')
  await dependencies.delay(1_000)
  await accounts.replaceTx(
    requestId,
    replacement === 'cancel' ? ReplacementType.Cancel : ReplacementType.Speed,
    principal
  )
  return true
}

function openRequestPanel(requestId: string, accounts: Accounts, dependencies: WalletWorkflowDependencies) {
  const account = accounts.current()
  const request = account?.getRequest(requestId)
  if (!account || !request) return false

  dependencies.store.getState().navForward('panel', {
    view: 'requestView',
    data: { step: 'confirm', accountId: account.address, requestId },
    position: { bottom: request.type === 'transaction' ? '200px' : '140px' }
  })
  return true
}

function navigatePanelBack(steps: number, dependencies: WalletWorkflowDependencies) {
  dependencies.store.getState().navBack('panel', steps)
}

function reviewAddChainRequest(
  requestId: string,
  accounts: Accounts,
  dependencies: WalletWorkflowDependencies
) {
  const request = currentRequest<AddChainRequest>(requestId, accounts)
  if (request?.type !== 'addChain') return false

  dependencies.store.getState().navHome({
    view: 'addChain',
    data: { chain: request.chain, requestId: request.handlerId }
  })
  return true
}

function reviewAddTokenRequest(
  requestId: string,
  accounts: Accounts,
  dependencies: WalletWorkflowDependencies
) {
  const request = currentRequest<AddTokenRequest>(requestId, accounts)
  if (request?.type !== 'addToken') return false

  const { address, symbol, decimals, logoURI, name, chainId } = request.token
  accounts.resolveRequest(request, null)
  dependencies.store.getState().navHome({
    view: 'tokens',
    data: { token: { address, chainId, decimals, logoURI, name, symbol } }
  })
  return true
}

function respondToExtension(
  extensionId: string,
  approved: boolean,
  dependencies: WalletWorkflowDependencies
) {
  const state = dependencies.store.getState()
  const pending = state.view.notifyData as { id?: string }
  if (state.view.notify !== 'extensionConnect' || pending?.id !== extensionId) return false

  state.trustExtension(extensionId, approved)
  state.notify('', {})
  return true
}

function respondToUpdater(
  action: 'restart' | 'install' | 'later' | 'skip' | 'dismiss-ready',
  dependencies: WalletWorkflowDependencies
) {
  const state = dependencies.store.getState()
  const badge = state.view.badge as { type?: string; version?: string }

  if (action === 'restart') {
    if (badge.type !== 'updateReady' || !dependencies.updater.updateReady) return false
    state.updateBadge('', undefined)
    dependencies.updater.quitAndInstall()
    return true
  }

  if (action === 'dismiss-ready') {
    if (badge.type !== 'updateReady') return false
    state.updateBadge('', undefined)
    return true
  }

  if (badge.type !== 'updateAvailable') return false
  state.updateBadge('', undefined)

  if (action === 'install') dependencies.updater.fetchUpdate()
  else {
    if (action === 'skip' && badge.version) state.dontRemind(badge.version)
    dependencies.updater.dismissUpdate()
  }
  return true
}

function handleTrayMouseout(dependencies: WalletWorkflowDependencies) {
  dependencies.windows.handleTrayMouseout()
}

function inspectOwnTrayWindow(
  event: Pick<Electron.IpcMainInvokeEvent, 'sender'>,
  x: number,
  y: number,
  dependencies: WalletWorkflowDependencies
) {
  if (dependencies.inspectEnabled) event.sender.inspectElement(x, y)
}

function approveRequest(
  requestId: string,
  accounts: Accounts,
  provider: Provider,
  dependencies: WalletWorkflowDependencies
) {
  const request = currentRequest(requestId, accounts)
  if (!request || (request.type !== 'transaction' && !isSignatureRequest(request))) return false
  if (request.authorization?.decision !== 'prompt') return false

  if (dependencies.vault.exists() && !dependencies.vault.isUnlocked()) {
    accounts.setRequestError(request.handlerId, new Error('Newframe locked'))
    return true
  }

  accounts.setRequestPending(request)
  if (isTransactionRequest(request)) {
    provider.approveTransactionRequest(request, (error, result) => {
      if (error) return accounts.setRequestError(request.handlerId, error)
      accounts.setTxSent(request.handlerId, result as string)
    })
  } else if (request.type === 'sign') {
    provider.approveSign(request, (error) => {
      if (error) return accounts.setRequestError(request.handlerId, error)
      accounts.setRequestSuccess(request.handlerId)
    })
  } else if (isTypedMessageSignatureRequest(request)) {
    provider.approveSignTypedData(request, (error) => {
      if (error) return accounts.setRequestError(request.handlerId, error)
      accounts.setRequestSuccess(request.handlerId)
    })
  }

  return true
}

export function createWalletWorkflowOperations(dependencies: WalletWorkflowDependencies) {
  const { accounts, chains, flashService, nameResolution, provider, transactionPolicy } = dependencies
  const securityService = createSecurityService(dependencies)
  const settingsService = createSettingsService(dependencies.store)

  return {
    addAccountFromSigner: (command: AccountAddFromSignerCommand) =>
      addAccountFromSigner(command, accounts, provider, dependencies),
    addWatchAccount: (addressOrName: string, name?: string) =>
      addWatchAccount(addressOrName, name, accounts, provider, nameResolution),
    addToken: (command: TokenAddCommand) => addToken(command, dependencies),
    adjustTransactionNonce: (requestId: string, direction: -1 | 1) =>
      adjustTransactionNonce(requestId, direction, accounts),
    approveRequest: (requestId: string) => approveRequest(requestId, accounts, provider, dependencies),
    cancelFlashOrder: (orderId: string, principal: TrustedPrincipal) =>
      cancelFlashOrder(orderId, principal, provider, flashService, dependencies),
    clearPermission: (accountId: string, originId?: string) =>
      clearPermission(accountId, originId, dependencies),
    clearOriginRequests: (accountId: string, originId: string) =>
      clearOriginRequests(accountId, originId, accounts),
    confirmRequestApproval: (requestId: string, approvalType: 'approveOtherChain' | 'approveGasLimit') =>
      confirmRequestApproval(requestId, approvalType, accounts),
    configureSecurity: securityService.configure,
    consumeHomeCommand: (commandId: number) => consumeHomeCommand(commandId, dependencies),
    createLatticeSigner: (deviceId: string, deviceName: string) =>
      createLatticeSigner(deviceId, deviceName, dependencies),
    dismissTransactionFeeNotice: (requestId: string) => dismissTransactionFeeNotice(requestId, accounts),
    disconnectSigner: (signerId: string) => disconnectSigner(signerId, dependencies),
    exportAccountPrivateKey: (accountId: string, password: string) =>
      exportAccountPrivateKey(accountId, password, dependencies),
    generateSeedPhrase: () => generateSeedPhrase(dependencies),
    getAddressChainUsage: (addresses: string[]) => getAddressChainUsage(addresses, chains, dependencies),
    handleTrayMouseout: () => handleTrayMouseout(dependencies),
    importSigner: (command: SignerImportCommand) => importSigner(command, accounts, provider, dependencies),
    inspectOwnTrayWindow: (event: Pick<Electron.IpcMainInvokeEvent, 'sender'>, x: number, y: number) =>
      inspectOwnTrayWindow(event, x, y, dependencies),
    loadLedgerAccounts: (signerId: string, accountCount: number) =>
      loadLedgerAccounts(signerId, accountCount, dependencies),
    locateKeystore: () => locateKeystore(dependencies),
    lockWallet: securityService.lock,
    lookupToken: (address: string, chainId: number) => lookupToken(address, chainId, provider, dependencies),
    navigatePanelBack: (steps = 1) => navigatePanelBack(steps, dependencies),
    openExternalUrl: (url: string) => dependencies.openExternal(url),
    openRequestPanel: (requestId: string) => openRequestPanel(requestId, accounts, dependencies),
    openSideTray: (command: SideTrayOpenCommand) => openSideTray(command, dependencies),
    openTransactionExplorer: (chainId: number, transactionHash?: string) =>
      openTransactionExplorer(chainId, transactionHash, dependencies),
    pairLattice: (signerId: string, pairCode: string) => pairLattice(signerId, pairCode, dependencies),
    quitApp: () => quitApp(dependencies),
    refreshPortfolio: () => refreshPortfolio(accounts, dependencies),
    rejectRequest: (requestId: string) => rejectRequest(requestId, accounts),
    removeAccount: (address: string, removeSeedSigner = false) =>
      removeAccount(address, removeSeedSigner, accounts, dependencies),
    removeNetwork: (chainId: number) => removeNetwork(chainId, dependencies),
    removeOrigin: (originId: string) => removeOrigin(originId, accounts, dependencies),
    removeToken: (token: Pick<WalletToken, 'address' | 'chainId'>) => removeToken(token, dependencies),
    renameAccount: (accountId: string, name: string) => renameAccount(accountId, name, accounts),
    reorderAccounts: (fromAccountId: string, toAccountId: string) =>
      reorderAccounts(fromAccountId, toAccountId, dependencies),
    reloadSigner: (signerId: string) => reloadSigner(signerId, dependencies),
    replaceTransaction: (requestId: string, replacement: 'cancel' | 'speed', principal: TrustedPrincipal) =>
      replaceTransaction(requestId, replacement, principal, accounts, dependencies),
    resetWallet: (scope: 'saved-data' | 'all-settings-data') => resetWallet(scope, dependencies),
    respondToExtension: (extensionId: string, approved: boolean) =>
      respondToExtension(extensionId, approved, dependencies),
    respondToUpdater: (action: 'restart' | 'install' | 'later' | 'skip' | 'dismiss-ready') =>
      respondToUpdater(action, dependencies),
    requestSignerCompatibility: (requestId: string) =>
      requestSignerCompatibility(requestId, accounts, transactionPolicy, dependencies),
    resetTransactionNonce: (requestId: string) => resetTransactionNonce(requestId, accounts),
    resolveAccessRequest: (requestId: string, approved: boolean) =>
      resolveAccessRequest(requestId, approved, accounts),
    resolveNetworkRequest: (command: NetworkRequestResolveCommand) =>
      resolveNetworkRequest(command, accounts, dependencies),
    resolveSwitchChainRequest: (requestId: string, approved: boolean) =>
      resolveSwitchChainRequest(requestId, approved, accounts, dependencies),
    reviewAddChainRequest: (requestId: string) => reviewAddChainRequest(requestId, accounts, dependencies),
    reviewAddTokenRequest: (requestId: string) => reviewAddTokenRequest(requestId, accounts, dependencies),
    securityStatus: securityService.status,
    setNetworkActivation: (chainId: number, enabled: boolean) =>
      setNetworkActivation(chainId, enabled, dependencies),
    setNetworkPrimaryRpc: (chainId: number, url: string) => setNetworkPrimaryRpc(chainId, url, dependencies),
    setTransactionFeeDefault: (requestId: string, level: 'asap' | 'fast' | 'standard' | 'slow') =>
      setTransactionFeeDefault(requestId, level, accounts, dependencies),
    submitTrezorInput: (command: TrezorInputCommand) => submitTrezorInput(command, dependencies),
    toggleWarning: (warning: WarningToggleCommand['warning']) => toggleWarning(warning, dependencies),
    unlockSecurity: securityService.unlock,
    updateNotification: (notificationId: string, action: 'dismiss' | 'expire') =>
      updateNotification(notificationId, action, dependencies),
    updateSettings: settingsService.update,
    updateTokenApproval: (command: RequestTokenApprovalUpdateCommand) =>
      updateTokenApproval(command, accounts),
    updateTransactionFee: (
      requestId: string,
      field: 'baseFee' | 'priorityFee' | 'gasPrice' | 'gasLimit',
      value: string
    ) => updateTransactionFee(requestId, field, value, accounts),
    writeClipboard: (text: string) => dependencies.clipboard.writeText(text)
  }
}
