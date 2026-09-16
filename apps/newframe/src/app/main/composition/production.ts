import log from 'electron-log'

import { createRendererPrincipal } from '../../../features/access-control/main/authority.js'
import {
  createAccountOnboardingService,
  type AccountOnboardingPorts,
  type AccountOnboardingService
} from '../../../features/accounts/main/accountOnboarding/service.js'
import { createProductionAirGapService } from '../../../features/accounts/main/airgap/production.js'
import type { AirGapService } from '../../../features/accounts/main/airgap/service.js'
import { Accounts } from '../../../features/accounts/main/index.js'
import {
  createAccountSelectionAdapter,
  createAddressChainUsageAdapter
} from '../../../features/accounts/main/production.js'
import {
  createProfileService,
  type ProfileService
} from '../../../features/accounts/main/profiles/service.js'
import {
  createDeferredAccountChainRpcPort,
  type AccountChainRpcPort
} from '../../../features/accounts/main/providerPort.js'
import type { AccountsRuntime } from '../../../features/accounts/main/runtime.js'
import { createSafeService, type SafeService } from '../../../features/accounts/main/safe.js'
import { simulateSafeProposal } from '../../../features/accounts/main/safeSimulation.js'
import { createAccountService, type AccountService } from '../../../features/accounts/main/service.js'
import { createAgentService, type AgentService } from '../../../features/agent-access/main/index.js'
import { createAssetRateService } from '../../../features/asset-data/main/assetRates/service.js'
import createExternalDataScanner from '../../../features/asset-data/main/externalData/index.js'
import {
  createImageService,
  type ImageService,
  type ImageServiceAdapters
} from '../../../features/asset-data/main/images/index.js'
import { Provider } from '../../../features/connections/main/provider/index.js'
import {
  createProviderRequestAdapter,
  createRequestApprovalAdapter
} from '../../../features/connections/main/provider/infrastructure/production.js'
import {
  createProviderProxyConnection,
  type ProviderProxyConnection
} from '../../../features/connections/main/provider/proxy.js'
import { createProviderStatePort } from '../../../features/connections/main/provider/statePort.js'
import {
  createProductionNameResolutionService,
  type NameResolutionService
} from '../../../features/name-resolution/main/nameResolution.js'
import { Chains } from '../../../features/networks/main/index.js'
import {
  createNetworkService,
  type NetworkService,
  type NetworkServicePorts
} from '../../../features/networks/main/service.js'
import ProviderRequestPolicy from '../../../features/portfolio/main/requestPolicy.js'
import {
  createPortfolioService,
  type PortfolioService,
  type PortfolioServiceAdapters
} from '../../../features/portfolio/main/service.js'
import {
  createRequestEditService,
  type RequestEditService
} from '../../../features/requests/main/requestEdits/service.js'
import { createRequestService, type RequestService } from '../../../features/requests/main/service.js'
import {
  createSecurityService,
  type SecurityService,
  type SecurityServicePorts
} from '../../../features/security/main/service.js'
import { createSettingsService } from '../../../features/settings/main/service.js'
import { createTokenLookupAdapter } from '../../../features/tokens/main/production.js'
import { createTokenService, type TokenService } from '../../../features/tokens/main/service.js'
import { createDeferredAccountTransactionPolicyPort } from '../../../features/transactions/main/accountPolicyPort.js'
import { maxFee, signerCompatibility } from '../../../features/transactions/main/index.js'
import { createRevealService, type RevealService } from '../../../features/transactions/main/reveal.js'
import {
  createSideTrayTransactionService,
  type SideTrayTransactionService
} from '../../../features/transactions/main/sideTrayService.js'
import {
  createTransactionSimulationProjection,
  simulateTransactionEffects
} from '../../../features/transactions/main/simulation.js'
import { createDeferredTransactionSimulationPort } from '../../../features/transactions/main/simulationPort.js'
import {
  createSendService,
  type SendIdempotencyEntry,
  type SendService
} from '../../../features/transactions/send/main/service.js'
import type { FlashService } from '../../../features/transactions/trade/main/index.js'
import { createProductionFlashService } from '../../../features/transactions/trade/main/instance.js'
import { createTradeService, type TradeService } from '../../../features/transactions/trade/main/service.js'
import {
  createRendererAuthorizationRegistry,
  type RendererAuthorizationRegistry
} from '../../../platform/ipc/main/authorization.js'
import {
  createOperationDispatcher,
  type IpcMainHandlerPort,
  type OperationServices
} from '../../../platform/ipc/main/operations.js'
import { createStateStream } from '../../../platform/ipc/main/stateStream.js'
import { createOperationService } from '../../../platform/operations/service.js'
import type { PersistenceLifecycle } from '../../../platform/persistence/ports.js'
import { createSafeClient, safeServiceNetworks } from '../../../platform/safe/client.js'
import { createSafeSimulationRpc } from '../../../platform/safe/simulation.js'
import type store from '../../../platform/state-store/index.js'
import { projectRendererState } from '../../../platform/state-sync/main/projections.js'
import {
  createPlatformService,
  type PlatformService,
  type PlatformServicePorts
} from '../platform/service.js'
import { createMainApp, type MainApp } from './createMainApp.js'

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
  safeService: SafeService
  requestEditService: RequestEditService
  requestService: RequestService
  portfolioService: PortfolioService
  securityService: SecurityService
  accountOnboardingService: AccountOnboardingService
  airgapService: AirGapService
  sendService: SendService
  tradeService: TradeService
}

interface ProductionAccountCapabilities {
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
  network: Pick<NetworkServicePorts, 'rpcMatchesChain'> & {
    lookupChainIcon(chainId: number): Promise<string>
  }
}

function createProductionProvider(
  store: typeof import('../../../platform/state-store/index.js').default,
  accounts: Accounts,
  chains: Chains,
  lookupChainIcon: (chainId: number) => Promise<string>,
  proxy: ProviderProxyConnection,
  reveal: RevealService,
  requests: RequestService
) {
  return new Provider({
    accounts,
    chains,
    lookupChainIcon,
    proxy,
    state: createProviderStatePort(store),
    store,
    reveal,
    requests
  })
}

export function createProductionCapabilities(
  store: typeof import('../../../platform/state-store/index.js').default,
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
      approveSign: (request, context) => requestApprovals.approveSign(request, context),
      approveSignTypedData: (request, context) => requestApprovals.approveSignTypedData(request, context),
      approveTransactionRequest: (request, context) =>
        requestApprovals.approveTransactionRequest(request, context)
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
  const provider = createProductionProvider(
    store,
    accounts,
    chains,
    adapters.network.lookupChainIcon,
    proxy,
    reveal,
    requestService
  )
  const requestApprovals = createRequestApprovalAdapter(provider)
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
  const airgapService = createProductionAirGapService(store, adapters.accounts.signers, operationService)
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
      add: (address, name, signer) => {
        accounts.add(address, name, signer).catch((error) => log.error('Could not add account', error))
      },
      get: (accountId) => accounts.get(accountId),
      select: async (accountId) => {
        await accountSelection(accountId)
      }
    },
    nameResolution: { resolve: resolveName },
    operations: operationService
  })
  const platformService = createPlatformService({ ...adapters.platform, accounts, store })
  const settingsService = createSettingsService(store, adapters.accounts.persistence)
  const addressChainUsage = createAddressChainUsageAdapter(chains, store)
  const accountService = createAccountService({
    accounts,
    addressChainUsage,
    selectAccount: accountSelection,
    signers: adapters.accountOnboarding.signers,
    store
  })
  const networkService = createNetworkService({ ...adapters.network, store })
  const safeRequests = new ProviderRequestPolicy(fetch, { maxRetries: 0, minIntervalMs: 500 })
  const safeRpc = createSafeSimulationRpc(chains)
  const safeClient = createSafeClient({
    call: safeRpc.call,
    decode: reveal.decode,
    request: (url, init) => safeRequests.request(url, init),
    networks: safeServiceNetworks({
      development: process.env.FRAME_PROFILE === 'dev',
      url: process.env.NEWFRAME_SAFE_SERVICE_URL,
      chainId: process.env.NEWFRAME_SAFE_CHAIN_ID
    })
  })
  const safeService = createSafeService({
    accounts,
    store,
    operations: operationService,
    client: safeClient,
    confirmations: {
      client: safeClient,
      accounts
    },
    simulate: (input, signal, observeConfiguration) =>
      simulateSafeProposal(
        input,
        {
          rpc: safeRpc,
          client: safeClient,
          observeConfiguration,
          projection: createTransactionSimulationProjection(store)
        },
        signal
      )
  })
  const tokenService = createTokenService({
    lookup: createTokenLookupAdapter(provider),
    operations: operationService,
    store
  })
  const requestEditService = createRequestEditService({ accounts })
  const flashService = createProductionFlashService(store, accounts, assetRateService)
  const portfolioService = createPortfolioService({
    accounts,
    assetRates: assetRateService,
    flash: flashService,
    ...adapters.portfolio,
    operations: operationService,
    store
  })
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
    flash: flashService,
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
        airgapService.dispose()
        safeService.dispose()
        safeRpc.dispose()
        accountSelection.dispose()
        addressChainUsage.dispose()
        adapters.accountOnboarding.dispose()
        providerRequests.dispose()
        requestApprovals.dispose()
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
    safeService,
    requestEditService,
    requestService,
    portfolioService,
    securityService,
    accountOnboardingService,
    airgapService
  }
}

function createProductionOperationServices(
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
  safeService: SafeService,
  requestEditService: RequestEditService,
  requestService: RequestService,
  portfolioService: PortfolioService,
  securityService: SecurityService,
  accountOnboardingService: AccountOnboardingService,
  sendService: SendService,
  tradeService: TradeService,
  airgapService: AirGapService
): OperationServices {
  return {
    accounts,
    airgap: airgapService,
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
    safes: safeService,
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
  safeService,
  requestEditService,
  requestService,
  portfolioService,
  securityService,
  accountOnboardingService,
  sendService,
  tradeService,
  airgapService
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
      safeService,
      requestEditService,
      requestService,
      portfolioService,
      securityService,
      accountOnboardingService,
      sendService,
      tradeService,
      airgapService
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
      if (app.started) {
        return
      }

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
