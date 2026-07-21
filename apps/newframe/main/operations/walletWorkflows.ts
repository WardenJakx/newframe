import { app, clipboard } from 'electron'
import { randomBytes } from 'crypto'
import { readFile } from 'fs/promises'
import log from 'electron-log'
import { isAddress } from 'ethers'
import { v5 as uuidv5 } from 'uuid'

import accounts from '../accounts'
import biometrics from '../biometrics'
import Erc20Contract from '../contracts/erc20'
import { flashService } from '../flash/instance'
import { getTokenDiscoveryProvider } from '../portfolio'
import provider from '../provider'
import signers from '../signers'
import TrezorBridge from '../signers/trezor/bridge'
import store from '../store'
import persist from '../store/persist'
import updater from '../updater'
import vault from '../vault'
import windows from '../windows'
import { openFileDialog } from '../windows/dialog'
import { openBlockExplorer, openExternal } from '../windows/window'
import {
  ReplacementType,
  type AccountRequest,
  type AccessRequest,
  type AddChainRequest,
  type AddTokenRequest,
  type PermitSignatureRequest,
  type TransactionRequest
} from '../accounts/types'
import type Signer from '../signers/Signer'
import type { Chain } from '../store/state'
import { ApprovalType } from '../../resources/constants'
import {
  buildSideTrayRoute,
  normalizeSideTrayFrameRequest,
  SIDE_TRAY_FRAME_ID
} from '../../resources/domain/sideTray'
import { toTokenId } from '../../resources/domain/token'
import {
  isSignatureRequest,
  isTransactionRequest,
  isTypedMessageSignatureRequest
} from '../../resources/domain/request'
import {
  findUnavailableSigners,
  getSignerDisplayType,
  isHardwareSigner,
  isSignerReady
} from '../../resources/domain/signer'
import { usesBaseFee } from '../../resources/domain/transaction'
import { capitalize, randomLetters } from '../../resources/utils'
import { toBigInt } from '../../resources/utils/numbers'
import { resolveName, selectAccount } from './workflows'
import { signerCompatibility as transactionCompatibility } from '../transaction'
import type {
  AccountAddFromSignerCommand,
  NetworkRequestResolveCommand,
  RequestTokenApprovalUpdateCommand,
  SecurityConfigureCommand,
  SecurityUnlockCommand,
  SettingsUpdateCommand,
  SignerImportCommand,
  SideTrayOpenCommand,
  TokenAddCommand,
  TrezorInputCommand,
  WalletToken,
  WarningToggleCommand
} from '../../resources/bridge/operations'

export function writeClipboard(text: string) {
  clipboard.writeText(text)
}

export function openExternalUrl(url: string) {
  openExternal(url)
}

export function openTransactionExplorer(chainId: number, transactionHash?: string) {
  const chain = store.getState().main.networks.ethereum[chainId]
  if (!chain) return false

  openBlockExplorer({ id: chainId, type: 'ethereum' }, transactionHash)
  return true
}

export async function lookupToken(address: string, chainId: number) {
  try {
    const token = await new Erc20Contract(address as Address, chainId).getTokenData()
    if (!token.totalSupply || token.decimals === undefined) return

    return {
      decimals: token.decimals,
      name: token.name,
      symbol: token.symbol,
      totalSupply: token.totalSupply
    }
  } catch (error) {
    log.warn('Could not load token data for contract', { address, chainId, error })
  }
}

function currentRequest<T extends AccountRequest = AccountRequest>(requestId: string) {
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

export function consumeHomeCommand(commandId: number) {
  const command = store.getState().tray.homeCommand as { id: number } | null
  if (!command || command.id !== commandId) return false
  store.getState().clearHomeCommand(commandId)
  return true
}

export function securityStatus() {
  const appLock = store.getState().main.appLock
  const summary = biometrics.summary()
  const biometricAvailable =
    summary.enabled && (summary.method === 'native' ? summary.nativeAvailable : summary.method === 'webauthn')

  return {
    ...appLock,
    biometricUnlockEnabled: summary.enabled,
    biometricAvailable,
    biometrics: {
      enabled: summary.enabled,
      method: summary.method,
      credential: summary.credential,
      nativeAvailable: summary.nativeAvailable
    }
  }
}

export async function configureSecurity(command: SecurityConfigureCommand) {
  if (command.mode === 'disabled') {
    biometrics.disable()
    store.getState().setBiometricUnlock(false)
    return
  }

  if (!vault.isUnlocked()) throw new Error('Unlock Newframe before enabling biometric login')

  if (command.mode === 'native') await biometrics.enableNative(vault.getKey() as string)
  else biometrics.enableWebAuthn(vault.getKey() as string, command.credential, command.secret)

  store.getState().setBiometricUnlock(true)
}

export async function unlockSecurity(command: SecurityUnlockCommand) {
  await callbackResult<boolean>((done) => {
    if (command.method === 'password') return signers.unlockApp(command.password, done)
    signers.unlockAppWithBiometrics(
      command.method === 'webauthn' ? { method: 'webauthn', secret: command.secret } : { method: 'native' },
      done
    )
  })
}

export function lockWallet() {
  return new Promise<void>((resolve, reject) => {
    signers.lockApp((error?: Error | null) => (error ? reject(error) : resolve()))
  })
}

export async function setNetworkPrimaryRpc(chainId: number, url: string) {
  if (!store.getState().main.networks.ethereum[chainId]) return false
  if (!(await rpcMatchesChain(url, chainId))) {
    throw new Error('The RPC endpoint returned a different chain ID.')
  }

  const state = store.getState()
  state.setPrimaryCustom('ethereum', chainId, url)
  state.selectPrimary('ethereum', chainId, 'custom')
  state.toggleConnection('ethereum', chainId, 'primary', true)
  return true
}

export function setNetworkActivation(chainId: number, enabled: boolean) {
  if (!store.getState().main.networks.ethereum[chainId] || (chainId === 1 && !enabled)) return false
  store.getState().activateNetwork('ethereum', chainId, enabled)
  return true
}

export function updateSettings(command: SettingsUpdateCommand) {
  const state = store.getState()

  switch (command.setting) {
    case 'autohide':
      return state.setAutohide(command.value)
    case 'launch':
      if (state.main.launch !== command.value) state.toggleLaunch()
      return
    case 'reveal':
      if (state.main.reveal !== command.value) state.toggleReveal()
      return
    case 'menubar-gas-price':
      return state.setMenubarGasPrice(command.value)
    case 'show-local-name-with-ens':
      if (state.main.showLocalNameWithENS !== command.value) state.toggleShowLocalNameWithENS()
      return
    case 'show-testnets':
      return state.setShowTestnets(command.value)
    case 'shortcut-enabled':
      return state.setShortcut('summon', { enabled: command.value })
    case 'shortcut-configuring':
      return state.setShortcut('summon', { configuring: command.value })
    case 'auto-discover-tokens':
      if (command.apiKey !== undefined) state.setPortfolioApiKey(command.apiKey)
      return state.setAutoDiscoverTokens(command.value)
    case 'trezor-derivation':
      return state.setTrezorDerivation(command.value)
    case 'ledger-derivation':
      return state.setLedgerDerivation(command.value)
    case 'lattice-derivation':
      return state.setLatticeDerivation(command.value)
    case 'ledger-live-account-limit':
      return state.setLiveAccountLimit(command.value)
    case 'lattice-account-limit':
      return state.setLatticeAccountLimit(command.value)
    case 'lattice-endpoint-mode':
      return state.setLatticeEndpointMode(command.value)
    case 'lattice-endpoint':
      return state.setLatticeEndpointCustom(command.value)
    case 'portfolio-api-key':
      return state.setPortfolioApiKey(command.value)
    case 'summon-shortcut':
      return state.setShortcut('summon', command.value)
  }
}

export function updateNotification(notificationId: string, action: 'dismiss' | 'expire') {
  const notification = store.getState().view.notifications[notificationId]
  if (!notification) return false

  if (action === 'dismiss') store.getState().dismissNotification(notificationId)
  else store.getState().expireNotification(notificationId)
  return true
}

export function clearPermission(accountId: string, originId?: string) {
  const state = store.getState()
  const permissions = state.main.permissions[accountId]
  if (!state.main.accounts[accountId] || !permissions || (originId && !permissions[originId])) return false

  if (originId) state.revokePermission(accountId, originId)
  else state.clearPermissions(accountId)
  return true
}

export function resetWallet(scope: 'saved-data' | 'all-settings-data') {
  if (scope === 'saved-data') {
    store.getState().resetSavedData()
    return
  }

  persist.clear()
  if (updater.updateReady) updater.quitAndInstall()
  else {
    app.relaunch()
    app.exit(0)
  }
}

export function quitApp() {
  app.quit()
}

export function addToken(command: TokenAddCommand) {
  store.getState().upsertTokens([command.token], { custom: true, source: 'custom' })
  return true
}

export function removeToken(token: Pick<WalletToken, 'address' | 'chainId'>) {
  const state = store.getState()
  const canonicalToken = state.main.tokens.byId[toTokenId(token)]
  if (!canonicalToken) return false

  state.removeCustomTokens([canonicalToken])
  return true
}

export function removeOrigin(originId: string) {
  if (!store.getState().main.origins[originId]) return false

  accounts.removeRequests(originId)
  store.getState().removeOrigin(originId)
  return true
}

export function toggleWarning(warning: WarningToggleCommand['warning']) {
  const actions = {
    explorer: () => store.getState().toggleExplorerWarning(),
    'gas-fee': () => store.getState().toggleGasFeeWarning(),
    'signer-compatibility': () => store.getState().toggleSignerCompatibilityWarning()
  }

  actions[warning]()
}

export function removeNetwork(chainId: number) {
  const network = store.getState().main.networks.ethereum[chainId]
  if (!network || chainId === 1) return false

  store.getState().removeNetwork(network)
  return true
}

export function submitTrezorInput(command: TrezorInputCommand) {
  const signer = signers.get(command.signerId)
  if (!signer || signer.type !== 'trezor') return false

  if (command.input === 'pin') TrezorBridge.pinEntered(command.signerId, command.value)
  if (command.input === 'passphrase') {
    TrezorBridge.passphraseEntered(command.signerId, command.value)
  }
  if (command.input === 'device-passphrase') TrezorBridge.enterPassphraseOnDevice(command.signerId)
  return true
}

export async function pairLattice(signerId: string, pairCode: string) {
  const signer = signers.get(signerId)
  if (!signer || signer.type !== 'lattice' || !('pair' in signer) || typeof signer.pair !== 'function') {
    return false
  }

  await signer.pair(pairCode)
  return true
}

export function removeAccount(address: string, removeSeedSigner = false) {
  const accountId = address.toLowerCase()
  const state = store.getState()
  const account = state.main.accounts[accountId]
  if (!account) return false

  let seedSignerId = ''
  if (removeSeedSigner && account.signer) {
    const signer = signers.get(account.signer)
    const hasAnotherAccount = Object.values(state.main.accounts).some(
      (candidate) => candidate.id !== accountId && candidate.signer === account.signer
    )
    if (signer?.type === 'seed' && !hasAnotherAccount) seedSignerId = signer.id
  }

  accounts.remove(accountId)
  if (seedSignerId) signers.remove(seedSignerId)
  return true
}

export function reorderAccounts(fromAccountId: string, toAccountId: string) {
  const state = store.getState()
  if (!state.main.accounts[fromAccountId] || !state.main.accounts[toAccountId]) return false
  state.reorderAccounts(fromAccountId, toAccountId)
  return true
}

export function renameAccount(accountId: string, name: string) {
  if (!accounts.get(accountId)) return false
  accounts.rename(accountId, name)
  return true
}

async function addAndSelectAccount(address: string, name: string, signerType: string) {
  const accountId = address.toLowerCase()
  if (!accounts.get(accountId)) accounts.add(address, name, { type: signerType })
  await selectAccount(accountId)
  return accountId
}

export async function addAccountFromSigner(command: AccountAddFromSignerCommand) {
  const signer = signers.get(command.signerId)
  const address = signer?.addresses.find(
    (candidate) => candidate.toLowerCase() === command.address.toLowerCase()
  )
  if (!signer || !address) return

  const label = getSignerDisplayType(signer.type)
  return addAndSelectAccount(address, command.name || `${capitalize(label)} Account`, signer.type)
}

export async function addWatchAccount(addressOrName: string, name?: string) {
  const address = isAddress(addressOrName) ? addressOrName : await resolveName(addressOrName)
  if (!address || !isAddress(address)) return
  return addAndSelectAccount(address, name || 'Watch Account', 'Address')
}

function createSigner(command: SignerImportCommand) {
  return callbackResult<Signer>((done) => {
    if (command.source === 'phrase') {
      signers.createFromPhrase(command.phrase, command.framePassword, done)
    } else if (command.source === 'private-key') {
      signers.createFromPrivateKey(command.privateKey, command.framePassword, done)
    } else {
      signers.createFromKeystore(command.keystore, command.keystorePassword, command.framePassword, done)
    }
  })
}

export async function importSigner(command: SignerImportCommand) {
  const signer = await createSigner(command)
  const address = signer.addresses[0]
  if (!address) throw new Error('No account address was created')
  return addAndSelectAccount(address, command.accountName || 'Hot Account', signer.type)
}

export function exportAccountPrivateKey(accountId: string, password: string) {
  const account = store.getState().main.accounts[accountId]
  if (!account) return

  return callbackResult<{ type: string; value: string }>((done) =>
    signers.exportAccountPrivateKey(account.address, password, done)
  )
}

export async function locateKeystore() {
  const selection = await openFileDialog()
  const filePath = selection?.filePaths?.[0]
  if (!filePath) return

  const parsed = JSON.parse(await readFile(filePath, 'utf8')) as Record<string, unknown>
  if (![1, 3].includes(Number(parsed.version))) throw new Error('Invalid keystore version')
  return parsed
}

export function generateSeedPhrase() {
  return callbackResult<string>((done) => signers.newPhrase(done))
}

export function createLatticeSigner(deviceId: string, deviceName: string) {
  store.getState().updateLattice(deviceId, {
    deviceId,
    baseUrl: 'https://signing.gridpl.us',
    endpointMode: 'default',
    paired: true,
    deviceName: (deviceName || 'GridPlus').substring(0, 14),
    tag: randomLetters(6),
    privKey: randomBytes(32).toString('hex')
  })
  return `lattice-${deviceId}`
}

export function disconnectSigner(signerId: string) {
  if (!signers.get(signerId)) return false
  signers.remove(signerId)
  return true
}

export function openSideTray(command: SideTrayOpenCommand) {
  const state = store.getState()
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
  if (exists) windows.refocusSideTray(frame.id)
  return true
}

const internalOriginName = 'newframe-internal'
const internalOriginId = uuidv5(internalOriginName, uuidv5.DNS)

function sendProviderRequest(payload: RPCRequestPayload) {
  return new Promise<RPCResponsePayload>((resolve) => provider.send(payload, resolve))
}

export async function cancelFlashOrder(orderId: string) {
  const state = store.getState()
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
  const response = await sendProviderRequest({
    id: Date.now(),
    jsonrpc: '2.0',
    method: 'personal_sign',
    chainId: `0x${chainId.toString(16)}`,
    params: [message, accountAddress],
    _origin: internalOriginId
  })
  if (response.error) throw new Error(errorMessage(response.error))
  if (typeof response.result !== 'string' || !/^0x[0-9a-fA-F]+$/.test(response.result)) {
    throw new Error('Cancel signature was not returned.')
  }

  await flashService.cancelOrder({ orderId, signature: response.result })
  return true
}

async function rpcMatchesChain(url: unknown, chainId: number) {
  if (typeof url !== 'string') return false

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 1, jsonrpc: '2.0', method: 'eth_chainId', params: [] }),
      signal: AbortSignal.timeout(10_000)
    })
    if (!response.ok) return false

    const payload = (await response.json()) as { result?: unknown }
    return (
      typeof payload.result === 'string' &&
      /^0x[0-9a-f]+$/i.test(payload.result) &&
      Number(BigInt(payload.result)) === chainId
    )
  } catch {
    return false
  }
}

export async function resolveNetworkRequest(command: NetworkRequestResolveCommand) {
  const state = store.getState()
  const request = command.requestId ? currentRequest<AddChainRequest>(command.requestId) : undefined
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
      if (!(await rpcMatchesChain((chain as Chain & { primaryRpc?: string }).primaryRpc, chainId))) {
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

export async function refreshPortfolio() {
  const state = store.getState()
  const account = state.main.accounts[state.main.currentAccount || '']
  if (!account?.address) return false
  const address = account.address.toLowerCase() as Address
  const chainIds = Object.values(state.main.networks.ethereum)
    .filter((network) => network.on)
    .map((network) => network.id)
  const discovery = getTokenDiscoveryProvider()

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
      if (Object.keys(portfolio.rates).length) state.setRates(portfolio.rates)
      Object.entries(portfolio.nativeRates).forEach(([id, rate]) =>
        state.setNativeCurrencyData('ethereum', Number(id), { usd: rate })
      )
    } catch (error) {
      log.warn(`Could not refresh portfolio provider balances for ${address}`, error)
    }
  }

  accounts.refreshBalances(address)
  return true
}

export function reloadSigner(signerId: string) {
  if (!signers.get(signerId)) return false

  signers.reload(signerId)
  return true
}

export function rejectRequest(requestId: string) {
  const request = currentRequest(requestId)
  if (!request) return false

  accounts.rejectRequest(request, { code: 4001, message: 'User rejected the request' })
  return true
}

export function resolveAccessRequest(requestId: string, approved: boolean) {
  const request = currentRequest<AccessRequest>(requestId)
  if (request?.type !== 'access') return false

  accounts.setAccess(request, approved)
  return true
}

export function resolveSwitchChainRequest(requestId: string, approved: boolean) {
  const request = currentRequest(requestId) as
    | (AccountRequest<'switchChain'> & { chain?: { id?: string | number; type?: string } })
    | undefined
  if (request?.type !== 'switchChain') return false

  if (approved) {
    const state = store.getState()
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

export function clearOriginRequests(accountId: string, originId: string) {
  if (!accounts.get(accountId)) return false

  accounts.clearRequestsByOrigin(accountId, originId)
  return true
}

export function requestSignerCompatibility(requestId: string) {
  const account = accounts.current()
  const request = account?.getRequest(requestId)
  if (!account || !request) {
    return {
      ok: false as const,
      error: 'request_not_found' as const,
      message: 'Could not locate the request.'
    }
  }

  const signerSummaries = store.getState().main.signers || {}
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
      ? transactionCompatibility((request as TransactionRequest).data, signer)
      : { signer: signer.type, tx: '', compatible: true }
  return { ok: true as const, compatibility }
}

export function confirmRequestApproval(
  requestId: string,
  approvalType: 'approveOtherChain' | 'approveGasLimit'
) {
  const request = currentRequest<TransactionRequest>(requestId)
  if (request?.type !== 'transaction') return false

  const approval = request.approvals?.find((candidate) => candidate.type === approvalType)
  if (!approval || approval.approved) return false

  accounts.confirmRequestApproval(requestId, approvalType as ApprovalType, {})
  return true
}

export function updateTokenApproval(command: RequestTokenApprovalUpdateCommand) {
  if (command.requestKind === 'transaction') {
    const request = currentRequest<TransactionRequest>(command.requestId)
    const action = request?.recognizedActions?.find((candidate) => candidate.id === command.actionId)
    if (request?.type !== 'transaction' || !action) return false

    return accounts.updateRequest(command.requestId, { amount: command.amount }, command.actionId)
  }

  const request = currentRequest<PermitSignatureRequest>(command.requestId)
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

export function updateTransactionFee(
  requestId: string,
  field: 'baseFee' | 'priorityFee' | 'gasPrice' | 'gasLimit',
  value: string
) {
  if (currentRequest(requestId)?.type !== 'transaction') return false

  const setters = {
    baseFee: accounts.setBaseFee.bind(accounts),
    priorityFee: accounts.setPriorityFee.bind(accounts),
    gasPrice: accounts.setGasPrice.bind(accounts),
    gasLimit: accounts.setGasLimit.bind(accounts)
  }
  setters[field](value, requestId, true)
  return true
}

export function setTransactionFeeDefault(requestId: string, level: 'asap' | 'fast' | 'standard' | 'slow') {
  const request = currentRequest<TransactionRequest>(requestId)
  if (request?.type !== 'transaction') return false

  const state = store.getState()
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

  return true
}

export function adjustTransactionNonce(requestId: string, direction: -1 | 1) {
  if (currentRequest(requestId)?.type !== 'transaction') return false
  accounts.adjustNonce(requestId, direction)
  return true
}

export function resetTransactionNonce(requestId: string) {
  if (currentRequest(requestId)?.type !== 'transaction') return false
  accounts.resetNonce(requestId)
  return true
}

export async function dismissTransactionFeeNotice(requestId: string) {
  if (currentRequest(requestId)?.type !== 'transaction') return false
  await new Promise<void>((resolve, reject) => {
    accounts.removeFeeUpdateNotice(requestId, (error) => (error ? reject(error) : resolve()))
  })
  return true
}

export async function replaceTransaction(requestId: string, replacement: 'cancel' | 'speed') {
  if (currentRequest(requestId)?.type !== 'transaction') return false

  store.getState().navBack('panel')
  await new Promise<void>((resolve) => setTimeout(resolve, 1_000))
  await accounts.replaceTx(
    requestId,
    replacement === 'cancel' ? ReplacementType.Cancel : ReplacementType.Speed
  )
  return true
}

export function openRequestPanel(requestId: string) {
  const account = accounts.current()
  const request = account?.getRequest(requestId)
  if (!account || !request) return false

  store.getState().navForward('panel', {
    view: 'requestView',
    data: { step: 'confirm', accountId: account.address, requestId },
    position: { bottom: request.type === 'transaction' ? '200px' : '140px' }
  })
  return true
}

export function navigatePanelBack(steps = 1) {
  store.getState().navBack('panel', steps)
}

export function reviewAddChainRequest(requestId: string) {
  const request = currentRequest<AddChainRequest>(requestId)
  if (request?.type !== 'addChain') return false

  store.getState().navHome({ view: 'addChain', data: { chain: request.chain, request } })
  return true
}

export function reviewAddTokenRequest(requestId: string) {
  const request = currentRequest<AddTokenRequest>(requestId)
  if (request?.type !== 'addToken') return false

  const { address, symbol, decimals, logoURI, name, chainId } = request.token
  accounts.resolveRequest(request, null)
  store.getState().navHome({
    view: 'tokens',
    data: { token: { address, chainId, decimals, logoURI, name, symbol } }
  })
  return true
}

export function respondToExtension(extensionId: string, approved: boolean) {
  const state = store.getState()
  const pending = state.view.notifyData as { id?: string }
  if (state.view.notify !== 'extensionConnect' || pending?.id !== extensionId) return false

  state.trustExtension(extensionId, approved)
  state.notify('', {})
  return true
}

export function respondToUpdater(action: 'restart' | 'install' | 'later' | 'skip' | 'dismiss-ready') {
  const state = store.getState()
  const badge = state.view.badge as { type?: string; version?: string }

  if (action === 'restart') {
    if (badge.type !== 'updateReady' || !updater.updateReady) return false
    state.updateBadge('', undefined)
    updater.quitAndInstall()
    return true
  }

  if (action === 'dismiss-ready') {
    if (badge.type !== 'updateReady') return false
    state.updateBadge('', undefined)
    return true
  }

  if (badge.type !== 'updateAvailable') return false
  state.updateBadge('', undefined)

  if (action === 'install') updater.fetchUpdate()
  else {
    if (action === 'skip' && badge.version) state.dontRemind(badge.version)
    updater.dismissUpdate()
  }
  return true
}

export function handleTrayMouseout() {
  windows.handleTrayMouseout()
}

export function inspectOwnTrayWindow(
  event: Pick<Electron.IpcMainInvokeEvent, 'sender'>,
  x: number,
  y: number
) {
  if (process.env.NODE_ENV === 'development') event.sender.inspectElement(x, y)
}

export function approveRequest(requestId: string) {
  const request = currentRequest(requestId)
  if (!request || (request.type !== 'transaction' && !isSignatureRequest(request))) return false

  if (vault.exists() && !vault.isUnlocked()) {
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
