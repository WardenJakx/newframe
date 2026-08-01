import { Accounts } from '../accounts/index.js'
import createExternalDataScanner from '../externalData/index.js'
import type { AccountsRuntime } from '../accounts/runtime.js'
import { createDeferredAccountChainRpcPort, type AccountChainRpcPort } from '../accounts/providerPort.js'
import { createAgentService, type AgentService } from '../agent/index.js'
import { createRendererPrincipal } from '../authority.js'
import { Chains } from '../chains/index.js'
import { createProductionFlashService } from '../flash/instance.js'
import type { FlashService } from '../flash/index.js'
import { createProviderProxyConnection, type ProviderProxyConnection } from '../provider/proxy.js'
import { createProductionNameResolutionService, type NameResolutionService } from '../nameResolution.js'
import { createRevealService, type RevealService } from '../reveal.js'
import { createImageService, type ImageService, type ImageServiceAdapters } from '../images/index.js'
import {
  createRendererAuthorizationRegistry,
  type RendererAuthorizationRegistry
} from '../ipc/authorization.js'
import {
  createOperationDispatcher,
  type IpcMainHandlerPort,
  type OperationServices
} from '../ipc/operations.js'
import { createStateStream } from '../ipc/stateStream.js'
import {
  createSideTrayTransactionService,
  type SideTrayTransactionService
} from '../features/transactions/sideTrayService.js'
import { projectRendererState } from '../state/projections.js'
import type store from '../store/index.js'
import { Provider } from '../provider/index.js'
import { createProviderStatePort } from '../provider/statePort.js'
import type { PersistenceLifecycle } from '../infrastructure/persistence/ports.js'
import { createDeferredAccountTransactionPolicyPort } from '../features/transactions/accountPolicyPort.js'
import { createDeferredTransactionSimulationPort } from '../features/transactions/simulationPort.js'
import { maxFee, signerCompatibility } from '../transaction/index.js'
import {
  createTransactionSimulationProjection,
  simulateTransactionEffects
} from '../transaction/simulation.js'
import { createMainApp, type MainApp } from './createMainApp.js'
import { createAssetRateService } from '../features/assetRates/service.js'
import { createOperationService } from '../features/operations/service.js'
import { createSendService, type SendIdempotencyEntry, type SendService } from '../features/send/service.js'
import { createTradeService, type TradeService } from '../features/trade/service.js'
import {
  createAccountOnboardingService,
  type AccountOnboardingPorts,
  type AccountOnboardingService
} from '../features/accountOnboarding/service.js'
import {
  createSecurityService,
  type SecurityService,
  type SecurityServicePorts
} from '../features/security/service.js'
import { createProfileService, type ProfileService } from '../features/profiles/service.js'
import {
  createPlatformService,
  type PlatformService,
  type PlatformServicePorts
} from '../features/platform/service.js'
import { createSettingsService } from '../features/settings/service.js'
import { createAccountService, type AccountService } from '../features/accounts/service.js'
import {
  createNetworkService,
  type NetworkService,
  type NetworkServicePorts
} from '../features/networks/service.js'
import { createTokenService, type TokenService } from '../features/tokens/service.js'
import { createRequestEditService, type RequestEditService } from '../features/requestEdits/service.js'
import {
  createPortfolioService,
  type PortfolioService,
  type PortfolioServiceAdapters
} from '../features/portfolio/service.js'
import { createRequestService, type RequestService } from '../features/requests/service.js'
import {
  createAccountSelectionAdapter,
  createAddressChainUsageAdapter,
  createFeeNoticeRemovalAdapter
} from '../infrastructure/accounts/production.js'
import { createTokenLookupAdapter } from '../infrastructure/tokens/production.js'
import { createProviderRequestAdapter } from '../infrastructure/provider/production.js'

export interface ProductionMainAppDependencies {
  ipc: IpcMainHandlerPort
  store: typeof store
  persistence: PersistenceLifecycle
  provider: Provider
  accounts: Accounts
  flashService: FlashService
  chains: Chains
  proxy: ProviderProxyConnection
  nameResolution: NameResolutionService
  accountCapabilities: ProductionAccountCapabilities
  infrastructureCallbacks: { dispose(): void }
  agentService: AgentService
  imageService: ImageService
  rendererAuthorization: RendererAuthorizationRegistry
  sideTrayTransactions: SideTrayTransactionService
  profileService: ProfileService
  platformService: PlatformService
  settingsService: ReturnType<typeof createSettingsService>
  accountService: AccountService
  networkService: NetworkService
  tokenService: TokenService
  requestEditService: RequestEditService
  requestService: RequestService
  portfolioService: PortfolioService
  securityService: SecurityService
  accountOnboardingService: AccountOnboardingService
  sendService: SendService
  tradeService: TradeService
}

export interface ProductionAccountCapabilities {
  chainRpc: ReturnType<typeof createDeferredAccountChainRpcPort>
  transactionPolicy: ReturnType<typeof createDeferredAccountTransactionPolicyPort>
  simulation: ReturnType<typeof createDeferredTransactionSimulationPort>
}

export interface ProductionCapabilityAdapters {
  accounts: AccountsRuntime
  images: ImageServiceAdapters
  platform: Omit<PlatformServicePorts, 'accounts' | 'store'>
  portfolio: PortfolioServiceAdapters
  security: Omit<SecurityServicePorts, 'operations' | 'store'> & { dispose?(): void }
  accountOnboarding: Pick<AccountOnboardingPorts, 'hardware' | 'keystore' | 'secrets' | 'signers'> & {
    dispose(): void
  }
  network: Pick<NetworkServicePorts, 'rpcMatchesChain'>
}

export function createProductionProvider(
  store: typeof import('../store/index.js').default,
  accounts: Accounts,
  chains: Chains,
  proxy: ProviderProxyConnection,
  reveal: RevealService,
  requests: RequestService
) {
  return new Provider({
    accounts,
    chains,
    proxy,
    state: createProviderStatePort(store),
    store,
    reveal,
    requests
  })
}

export function createProductionCapabilities(
  store: typeof import('../store/index.js').default,
  adapters: ProductionCapabilityAdapters
) {
  const proxy = createProviderProxyConnection()
  const nameResolution = createProductionNameResolutionService(proxy)
  const reveal = createRevealService(proxy, nameResolution)
  const accountCapabilities = {
    chainRpc: createDeferredAccountChainRpcPort(),
    transactionPolicy: createDeferredAccountTransactionPolicyPort(),
    simulation: createDeferredTransactionSimulationPort()
  }
  const requestService = createRequestService({
    accounts: {
      clearRequestsByOrigin: (accountId, originId) => accounts.clearRequestsByOrigin(accountId, originId),
      get: (accountId) => accounts.get(accountId),
      getFrameAccount: (accountId) => accounts.getFrameAccount(accountId),
      replaceTx: (requestId, replacement, principal) => accounts.replaceTx(requestId, replacement, principal),
      setRequestError: (requestId, error) => accounts.setRequestError(requestId, error),
      setRequestPending: (request) => accounts.setRequestPending(request),
      setRequestSuccess: (requestId) => accounts.setRequestSuccess(requestId),
      setTxSent: (requestId, hash) => accounts.setTxSent(requestId, hash)
    },
    agent: {
      resolveAccess: (requestId, approved) => agentService.resolveAgentAccessRequest(requestId, approved)
    },
    clock: { delay: (ms) => new Promise((resolve) => setTimeout(resolve, ms)) },
    network: adapters.network,
    provider: {
      approveSign: (request, callback) => provider.approveSign(request, callback),
      approveSignTypedData: (request, callback) => provider.approveSignTypedData(request, callback),
      approveTransactionRequest: (request, callback) => provider.approveTransactionRequest(request, callback)
    },
    store,
    transactionPolicy: accountCapabilities.transactionPolicy.port,
    vault: adapters.security.vault
  })
  const accounts = new Accounts(store, {
    chainRpc: accountCapabilities.chainRpc.port,
    transactionPolicy: accountCapabilities.transactionPolicy.port,
    simulation: accountCapabilities.simulation.port,
    nameResolution,
    reveal,
    runtime: adapters.accounts,
    createDataScanner: createExternalDataScanner,
    requests: requestService
  })
  const chains = new Chains(store)
  const provider = createProductionProvider(store, accounts, chains, proxy, reveal, requestService)
  const resolveName = (name: string) => nameResolution.resolveAddress(name)
  const accountSelection = createAccountSelectionAdapter(accounts, provider)
  const assetRateService = createAssetRateService({
    store,
    clock: { now: adapters.accounts.now }
  })
  const operationService = createOperationService({
    store,
    clock: { now: adapters.accounts.now }
  })
  const profileService = createProfileService({
    accounts,
    operations: operationService,
    provider,
    store
  })
  const securityService = createSecurityService({
    ...adapters.security,
    operations: operationService,
    store
  })
  const accountOnboardingService = createAccountOnboardingService({
    ...adapters.accountOnboarding,
    accounts: {
      add: (address, name, signer) => accounts.add(address, name, signer),
      get: (accountId) => accounts.get(accountId),
      select: async (accountId) => {
        await accountSelection(accountId)
      }
    },
    nameResolution: { resolve: resolveName },
    operations: operationService
  })
  const platformService = createPlatformService({ ...adapters.platform, accounts, store })
  const settingsService = createSettingsService(store)
  const addressChainUsage = createAddressChainUsageAdapter(chains, store)
  const feeNotices = createFeeNoticeRemovalAdapter(accounts)
  const accountService = createAccountService({
    accounts,
    addressChainUsage,
    selectAccount: accountSelection,
    signers: adapters.accountOnboarding.signers,
    store
  })
  const networkService = createNetworkService({ ...adapters.network, store })
  const tokenService = createTokenService({
    lookup: createTokenLookupAdapter(provider),
    operations: operationService,
    store
  })
  const requestEditService = createRequestEditService({ accounts, feeNotices, store })
  const portfolioService = createPortfolioService({
    accounts,
    assetRates: assetRateService,
    ...adapters.portfolio,
    operations: operationService,
    store
  })
  const flashService = createProductionFlashService(store, accounts, assetRateService)
  const agentService = createAgentService(accounts, flashService, store, requestService)
  const imageService = createImageService(store, adapters.images)
  const rendererAuthorization = createRendererAuthorizationRegistry()
  const providerRequests = createProviderRequestAdapter(provider)
  const sideTrayTransactions = createSideTrayTransactionService({
    accounts,
    provider: providerRequests,
    store,
    now: adapters.accounts.now
  })
  const sendService = createSendService({
    canonical: {
      snapshot: () => {
        const main = store.getState().main
        return {
          currentAccount: main.currentAccount,
          accounts: main.accounts,
          balances: main.balances,
          networks: main.networks.ethereum,
          tokens: main.tokens.byId
        }
      }
    },
    clock: { now: adapters.accounts.now },
    idempotency: new Map<string, SendIdempotencyEntry>(),
    names: { resolve: resolveName },
    operations: operationService,
    transactions: { submit: sideTrayTransactions.submitCurrentAccountTransaction }
  })
  const tradeService = createTradeService({
    canonical: {
      snapshot: () => {
        const main = store.getState().main
        return {
          currentAccount: main.currentAccount,
          accounts: main.accounts,
          networks: main.networks.ethereum,
          orders: main.orders
        }
      }
    },
    clock: { now: adapters.accounts.now },
    flash: {
      quote: (request) => flashService.quote(request),
      submitOrder: (request) => flashService.submitOrder(request),
      cancelOrder: (request) => flashService.cancelOrder(request)
    },
    operations: operationService,
    signatures: {
      signMessage: sideTrayTransactions.signCurrentAccountMessage,
      signTypedData: sideTrayTransactions.signCurrentAccountTypedData
    },
    transactions: { submit: sideTrayTransactions.submitCurrentAccountTransaction }
  })
  return {
    accounts,
    assetRateService,
    chains,
    flashService,
    provider,
    proxy,
    nameResolution,
    reveal,
    accountCapabilities,
    infrastructureCallbacks: {
      dispose() {
        accountSelection.dispose()
        addressChainUsage.dispose()
        adapters.accountOnboarding.dispose()
        feeNotices.dispose()
        providerRequests.dispose()
        adapters.security.dispose?.()
      }
    },
    agentService,
    imageService,
    operationService,
    platformService,
    profileService,
    rendererAuthorization,
    sideTrayTransactions,
    sendService,
    tradeService,
    settingsService,
    accountService,
    networkService,
    tokenService,
    requestEditService,
    requestService,
    portfolioService,
    securityService,
    accountOnboardingService
  }
}

export function createProductionOperationServices(
  provider: Provider,
  accounts: Accounts,
  nameResolution: NameResolutionService,
  agentService: AgentService,
  imageService: ImageService,
  rendererAuthorization: RendererAuthorizationRegistry,
  sideTrayTransactions: SideTrayTransactionService,
  profileService: ProfileService,
  platformService: PlatformService,
  settingsService: ReturnType<typeof createSettingsService>,
  accountService: AccountService,
  networkService: NetworkService,
  tokenService: TokenService,
  requestEditService: RequestEditService,
  requestService: RequestService,
  portfolioService: PortfolioService,
  securityService: SecurityService,
  accountOnboardingService: AccountOnboardingService,
  sendService: SendService,
  tradeService: TradeService
): OperationServices {
  return {
    accounts,
    accountMutations: accountService,
    agent: agentService,
    networks: networkService,
    portfolio: portfolioService,
    platform: platformService,
    profiles: profileService,
    requestEdits: requestEditService,
    requests: requestService,
    security: securityService,
    accountOnboarding: accountOnboardingService,
    send: sendService,
    trade: tradeService,
    settings: settingsService,
    tokens: tokenService,
    authorizeRenderer: rendererAuthorization.authorizeRenderer,
    createRendererPrincipal,
    requestTokenImage: imageService.requestTokenImage,
    resolveName: (name) => nameResolution.resolveAddress(name)
  }
}

export function createProductionMainApp({
  ipc,
  store,
  persistence,
  provider,
  accounts,
  flashService,
  chains,
  proxy,
  nameResolution,
  accountCapabilities,
  infrastructureCallbacks,
  agentService,
  imageService,
  rendererAuthorization,
  sideTrayTransactions,
  profileService,
  platformService,
  settingsService,
  accountService,
  networkService,
  tokenService,
  requestEditService,
  requestService,
  portfolioService,
  securityService,
  accountOnboardingService,
  sendService,
  tradeService
}: ProductionMainAppDependencies): MainApp {
  const operationDispatcher = createOperationDispatcher(
    createProductionOperationServices(
      provider,
      accounts,
      nameResolution,
      agentService,
      imageService,
      rendererAuthorization,
      sideTrayTransactions,
      profileService,
      platformService,
      settingsService,
      accountService,
      networkService,
      tokenService,
      requestEditService,
      requestService,
      portfolioService,
      securityService,
      accountOnboardingService,
      sendService,
      tradeService
    )
  )
  const stateStream = createStateStream({
    store,
    authorizeRenderer: rendererAuthorization.authorizeRenderer,
    projectRendererState
  })

  const app = createMainApp({ ipc, operationDispatcher, stateStream })
  const simulationProjection = createTransactionSimulationProjection(store)
  let disconnectCapabilities: Array<() => void> = []
  const accountChainRpc: AccountChainRpcPort = {
    send: (payload, respond, principal) => provider.send(payload, respond, principal),
    sendAsync: (payload, callback) => provider.sendAsync(payload, callback),
    getL1GasCost: (transaction) => provider.getL1GasCost(transaction),
    on: (event, listener) => provider.on(event, listener as Parameters<typeof provider.on>[1]),
    off: (event, listener) => provider.off(event, listener as Parameters<typeof provider.off>[1])
  }

  return {
    get started() {
      return app.started
    },
    start() {
      if (app.started) return

      try {
        // Startup awaits the same idempotent promise when Electron becomes ready.
        // Attach a handler now so an early storage failure is not reported as unhandled.
        void persistence.start().catch(() => undefined)
        chains.start()
        disconnectCapabilities.push(accountCapabilities.chainRpc.connect(accountChainRpc))
        disconnectCapabilities.push(
          accountCapabilities.transactionPolicy.connect({ maxFee, signerCompatibility })
        )
        disconnectCapabilities.push(
          accountCapabilities.simulation.connect({
            simulateTransactionEffects: (request) =>
              simulateTransactionEffects(request, provider, simulationProjection)
          })
        )
        provider.start()
        nameResolution.start()
        proxy.start()
        imageService.start()
        app.start()
      } catch (error) {
        rendererAuthorization.dispose()
        tradeService.dispose()
        sendService.dispose()
        imageService.dispose()
        agentService.dispose()
        requestService.dispose()
        infrastructureCallbacks.dispose()
        flashService.dispose()
        accounts.dispose()
        proxy.dispose()
        nameResolution.dispose()
        provider.dispose()
        disconnectCapabilities.reverse().forEach((disconnect) => disconnect())
        disconnectCapabilities = []
        chains.dispose()
        persistence.dispose()
        throw error
      }
    },
    dispose() {
      app.dispose()
      rendererAuthorization.dispose()
      tradeService.dispose()
      sendService.dispose()
      imageService.dispose()
      agentService.dispose()
      requestService.dispose()
      infrastructureCallbacks.dispose()
      flashService.dispose()
      accounts.dispose()
      proxy.dispose()
      nameResolution.dispose()
      provider.dispose()
      disconnectCapabilities.reverse().forEach((disconnect) => disconnect())
      disconnectCapabilities = []
      chains.dispose()
      persistence.dispose()
    }
  }
}
