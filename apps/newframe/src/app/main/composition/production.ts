import log from 'electron-log'

import {
  createAccountOnboardingService,
  type AccountOnboardingPorts,
  type AccountOnboardingService
} from '../../../features/accounts/main/accountOnboarding/service.ts'
import { createProductionAirGapService } from '../../../features/accounts/main/airgap/production.ts'
import type { AirGapService } from '../../../features/accounts/main/airgap/service.ts'
import { Accounts } from '../../../features/accounts/main/index.ts'
import {
  createAccountSelectionAdapter,
  createAddressChainUsageAdapter
} from '../../../features/accounts/main/production.ts'
import {
  createProfileService,
  type ProfileService
} from '../../../features/accounts/main/profiles/service.ts'
import {
  createDeferredAccountChainRpcPort,
  type AccountChainRpcPort
} from '../../../features/accounts/main/providerPort.ts'
import type { AccountsRuntime } from '../../../features/accounts/main/runtime.ts'
import { createSafeService, type SafeService } from '../../../features/accounts/main/safe.ts'
import { createSafeMessageService } from '../../../features/accounts/main/safeMessage.ts'
import { createDeferredSafeMessageApprovalPort } from '../../../features/accounts/main/safeMessagePort.ts'
import { simulateSafeProposal } from '../../../features/accounts/main/safeSimulation.ts'
import type { SafeTransactionPort } from '../../../features/accounts/main/safeTransactionPort.ts'
import { createAccountService, type AccountService } from '../../../features/accounts/main/service.ts'
import { createAgentService, type AgentService } from '../../../features/agent-access/main/index.ts'
import { createAssetRateService } from '../../../features/asset-data/main/assetRates/service.ts'
import createExternalDataScanner from '../../../features/asset-data/main/externalData/index.ts'
import {
  createImageService,
  type ImageService,
  type ImageServiceAdapters
} from '../../../features/asset-data/main/images/index.ts'
import { Chains } from '../../../features/chains/main/index.ts'
import {
  createChainService,
  type ChainService,
  type ChainServicePorts
} from '../../../features/chains/main/service.ts'
import { createProductionOriginsService } from '../../../features/connections/main/origins.ts'
import {
  createProviderRequestAdapter,
  createRequestApprovalAdapter,
  createNamedAccountTransactionAdapter
} from '../../../features/connections/main/provider/infrastructure/production.ts'
import {
  createProviderProxyConnection,
  type ProviderProxyConnection
} from '../../../features/connections/main/provider/proxy.ts'
import { createProviderStatePort } from '../../../features/connections/main/provider/statePort.ts'
import {
  createProductionNameResolutionService,
  type NameResolutionService
} from '../../../features/name-resolution/main/nameResolution.ts'
import ProviderRequestPolicy from '../../../features/portfolio/main/requestPolicy.ts'
import {
  createPortfolioService,
  type PortfolioService,
  type PortfolioServiceAdapters
} from '../../../features/portfolio/main/service.ts'
import {
  createRequestEditService,
  type RequestEditService
} from '../../../features/requests/main/requestEdits/service.ts'
import { createRequestService, type RequestService } from '../../../features/requests/main/service.ts'
import {
  createSecurityService,
  type SecurityService,
  type SecurityServicePorts
} from '../../../features/security/main/service.ts'
import { createSettingsService } from '../../../features/settings/main/service.ts'
import { createTokenLookupAdapter } from '../../../features/tokens/main/production.ts'
import { createTokenService, type TokenService } from '../../../features/tokens/main/service.ts'
import { createDeferredAccountTransactionPolicyPort } from '../../../features/transactions/main/accountPolicyPort.ts'
import { maxFee, signerCompatibility } from '../../../features/transactions/main/index.ts'
import { createRevealService, type RevealService } from '../../../features/transactions/main/reveal.ts'
import {
  createSideTrayTransactionService,
  type SideTrayTransactionService
} from '../../../features/transactions/main/sideTrayService.ts'
import {
  createTransactionSimulationProjection,
  simulateTransactionEffects
} from '../../../features/transactions/main/simulation.ts'
import { createDeferredTransactionSimulationPort } from '../../../features/transactions/main/simulationPort.ts'
import {
  createSendService,
  type SendIdempotencyEntry,
  type SendService
} from '../../../features/transactions/send/main/service.ts'
import type { FlashService } from '../../../features/transactions/trade/main/index.ts'
import { createProductionFlashService } from '../../../features/transactions/trade/main/instance.ts'
import { createTradeService, type TradeService } from '../../../features/transactions/trade/main/service.ts'
import { internet } from '../../../platform/internet/index.ts'
import {
  createRendererAuthorizationRegistry,
  type RendererAuthorizationRegistry
} from '../../../platform/ipc/main/authorization.ts'
import { createOperationDispatcher, type IpcMainHandlerPort } from '../../../platform/ipc/main/operations.ts'
import { createStateStream } from '../../../platform/ipc/main/stateStream.ts'
import { createOperationService } from '../../../platform/operations/service.ts'
import type { PersistenceLifecycle } from '../../../platform/persistence/ports.ts'
import { createSafeClient, safeServiceChains } from '../../../platform/safe/client.ts'
import { createSafeSimulationRpc } from '../../../platform/safe/simulation.ts'
import type store from '../../../platform/state-store/index.ts'
import { projectRendererState } from '../../../platform/state-sync/main/projections.ts'
import { createMainProcessSource } from '../gateway/requestSource.ts'
import type { OperationServices } from '../ipc-handlers/renderer.ts'
import { RpcIpcHandlers } from '../ipc-handlers/rpc.ts'
import {
  createPlatformService,
  type PlatformService,
  type PlatformServicePorts
} from '../platform/service.ts'
import { createMainApp, type MainApp } from './createMainApp.ts'

export interface ProductionMainAppDependencies {
  ipc: IpcMainHandlerPort
  store: typeof store
  persistence: PersistenceLifecycle
  provider: RpcIpcHandlers
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
  chainService: ChainService
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
    protectedOperations: { exportSecret(address: string): Promise<{ type: string; value: string }> }
    dispose(): void
  }
  chain: Pick<ChainServicePorts, 'rpcMatchesChain'> & {
    lookupChainIcon(chainId: number): Promise<string>
  }
}

function createProductionProvider(
  store: typeof import('../../../platform/state-store/index.ts').default,
  accounts: Accounts,
  chains: Chains,
  lookupChainIcon: (chainId: number) => Promise<string>,
  proxy: ProviderProxyConnection,
  reveal: RevealService,
  requests: RequestService,
  safeTransactions: SafeTransactionPort,
  exportSecret: NonNullable<import('../ipc-handlers/rpc.ts').RpcIpcHandlerDependencies['exportSecret']>
) {
  return new RpcIpcHandlers({
    exportSecret,
    origins: createProductionOriginsService(store, accounts, requests),
    accounts,
    chains,
    lookupChainIcon,
    proxy,
    state: createProviderStatePort(store, accounts),
    store,
    reveal,
    requests,
    safeTransactions
  })
}

export function createProductionCapabilities(
  store: typeof import('../../../platform/state-store/index.ts').default,
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
  const safeMessages = createDeferredSafeMessageApprovalPort()
  const safeTransactions: SafeTransactionPort = {
    prepareDraft: (input) => safeService.prepareDraft(input),
    attach: (draft, requestId) => safeService.attach(draft, requestId),
    approve: (command, context) => safeService.approve(command, context),
    removeUnsigned: (identity) => safeService.removeUnsigned(identity),
    cleanupUnsigned: (liveRequestIds) => safeService.cleanupUnsigned(liveRequestIds),
    prepareExecution: (identity, executorId) => safeService.prepareExecution(identity, executorId),
    execute: (identity, executorId, adjustments, context, operationId) =>
      safeService.execute(identity, executorId, adjustments, context, operationId),
    status: (query, owner) => safeService.status(query, owner)
  }
  const requestService = createRequestService({
    accounts: {
      clearRequestsByOrigin: (accountId, originId) => accounts.clearRequestsByOrigin(accountId, originId),
      get: (accountId) => accounts.get(accountId),
      getFrameAccount: (accountId) => accounts.getFrameAccount(accountId),
      replaceTx: (requestId, replacement, requestSource) =>
        accounts.replaceTx(requestId, replacement, requestSource),
      setRequestError: (requestId, error) => accounts.setRequestError(requestId, error),
      setRequestPending: (request) => accounts.setRequestPending(request),
      setRequestSuccess: (requestId) => accounts.setRequestSuccess(requestId),
      setTxSent: (requestId, hash) => accounts.setTxSent(requestId, hash),
      trackSafeExecution: (safeTxHash, outerTxHash) => accounts.trackSafeExecution(safeTxHash, outerTxHash)
    },
    agent: {
      resolveAccess: (requestId, approved) => agentService.resolveAgentAccessRequest(requestId, approved)
    },
    clock: { delay: (ms) => new Promise((resolve) => setTimeout(resolve, ms)) },
    chain: adapters.chain,
    provider: {
      approveSign: (request, context) => requestApprovals.approveSign(request, context),
      approveSignTypedData: (request, context) => requestApprovals.approveSignTypedData(request, context),
      approveTransactionRequest: (request, context) =>
        requestApprovals.approveTransactionRequest(request, context)
    },
    safeMessages: safeMessages.port,
    safeTransactions,
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
    createDataScanner: (canonicalStore) =>
      createExternalDataScanner(canonicalStore, internet, (tokens, options) =>
        tokenService.register(tokens, options)
      ),
    registerTokens: (tokens, options) => tokenService.register(tokens, options),
    requests: requestService
  })
  const chains = new Chains(store, internet)
  const provider = createProductionProvider(
    store,
    accounts,
    chains,
    (chainId) => adapters.chain.lookupChainIcon(chainId),
    proxy,
    reveal,
    requestService,
    safeTransactions,
    (address) => adapters.accountOnboarding.protectedOperations.exportSecret(address)
  )
  const requestApprovals = createRequestApprovalAdapter(provider.protectedOperations)
  const resolveName = (name: string) => nameResolution.resolveAddress(name)
  const accountSelection = createAccountSelectionAdapter(accounts, provider)
  const assetRateService = createAssetRateService({
    store,
    clock: { now: () => adapters.accounts.now() }
  })
  const operationService = createOperationService({
    store,
    clock: { now: () => adapters.accounts.now() }
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
    hardware: adapters.accountOnboarding.hardware,
    keystore: adapters.accountOnboarding.keystore,
    secrets: adapters.accountOnboarding.secrets,
    signers: adapters.accountOnboarding.signers,
    accounts: {
      add: (address, name, signer) => {
        accounts
          .add(address, name, signer)
          .catch((error: unknown) => log.error('Could not add account', error))
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
  const chainService = createChainService({ ...adapters.chain, store })
  const safeRequests = new ProviderRequestPolicy(internet.request, { maxRetries: 0, minIntervalMs: 500 })
  const safeRpc = createSafeSimulationRpc(chains)
  const safeClient = createSafeClient({
    call: (chainId, address, data, blockTag, signal) =>
      safeRpc.call(chainId, address, data, blockTag, signal),
    decode: (address, chainId, data) => reveal.decode(address, chainId, data),
    request: (url, init) => safeRequests.request(url, init),
    chains: safeServiceChains({
      development: process.env.FRAME_PROFILE === 'dev',
      url: process.env.NEWFRAME_SAFE_SERVICE_URL,
      chainId: process.env.NEWFRAME_SAFE_CHAIN_ID
    })
  })
  const safeMessageService = createSafeMessageService({ store, accounts, client: safeClient })
  const disconnectSafeMessages = safeMessages.connect(safeMessageService)
  const safeService = createSafeService({
    accounts,
    store,
    operations: operationService,
    client: safeClient,
    transactions: {
      accounts,
      provider: createNamedAccountTransactionAdapter({
        prepareAccountTransaction: provider.prepareAccountTransaction.bind(provider),
        executeAccountTransaction: provider.protectedOperations.executeAccountTransaction.bind(
          provider.protectedOperations
        )
      }),
      submitted: (result) => requestService.notifySafeTransactionSubmitted(result)
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
    now: () => adapters.accounts.now()
  })
  const sendService = createSendService({
    canonical: {
      snapshot: () => {
        const main = store.getState().main
        return {
          currentAccount: main.currentAccount,
          accounts: main.accounts,
          balances: main.balances,
          chains: main.chains.ethereum,
          tokens: main.tokens.byId
        }
      }
    },
    clock: { now: () => adapters.accounts.now() },
    idempotency: new Map<string, SendIdempotencyEntry>(),
    names: { resolve: resolveName },
    operations: operationService,
    transactions: {
      submit: (command, requestSource) =>
        sideTrayTransactions.submitCurrentAccountTransaction(command, requestSource)
    }
  })
  const tradeService = createTradeService({
    canonical: {
      snapshot: () => {
        const main = store.getState().main
        return {
          currentAccount: main.currentAccount,
          accounts: main.accounts,
          chains: main.chains.ethereum,
          orders: main.orders
        }
      }
    },
    clock: { now: () => adapters.accounts.now() },
    flash: flashService,
    operations: operationService,
    signatures: {
      signMessage: (command, requestSource) =>
        sideTrayTransactions.signCurrentAccountMessage(command, requestSource),
      signTypedData: (command, requestSource) =>
        sideTrayTransactions.signCurrentAccountTypedData(command, requestSource)
    },
    transactions: {
      submit: (command, requestSource) =>
        sideTrayTransactions.submitCurrentAccountTransaction(command, requestSource)
    }
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
        disconnectSafeMessages()
        safeMessageService.dispose()
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
    chainService,
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
  provider: RpcIpcHandlers,
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
  chainService: ChainService,
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
    chains: chainService,
    portfolio: portfolioService,
    platform: platformService,
    profiles: profileService,
    requestEdits: requestEditService,
    requests: requestService,
    security: securityService,
    accountOnboarding: accountOnboardingService,
    protectedOperations: provider.protectedOperations,
    send: sendService,
    trade: tradeService,
    settings: settingsService,
    tokens: tokenService,
    safes: safeService,
    authorizeRenderer: (event) => rendererAuthorization.authorizeRenderer(event),
    requestTokenImage: (tokenId) => imageService.requestTokenImage(tokenId),
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
  chainService,
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
      chainService,
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
    authorizeRenderer: (event) => rendererAuthorization.authorizeRenderer(event),
    projectRendererState
  })

  const app = createMainApp({ ipc, operationDispatcher, stateStream })
  const simulationProjection = createTransactionSimulationProjection(store)
  let disconnectCapabilities: Array<() => void> = []
  const simulationSource = createMainProcessSource('transaction-simulation')
  const accountChainRpc: AccountChainRpcPort = {
    send: (payload, respond, requestSource) => provider.send(payload, respond, requestSource),
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
        void persistence
          .start()
          .then(() => safeService.cleanupUnsignedDrafts(new Set()))
          .catch(() => undefined)
        chains.start()
        disconnectCapabilities.push(accountCapabilities.chainRpc.connect(accountChainRpc))
        disconnectCapabilities.push(
          accountCapabilities.transactionPolicy.connect({ maxFee, signerCompatibility })
        )
        disconnectCapabilities.push(
          accountCapabilities.simulation.connect({
            simulateTransactionEffects: (request) =>
              simulateTransactionEffects(
                request,
                {
                  send: (payload, respond) => provider.send(payload, respond, simulationSource),
                  sendAsync: (payload, callback) => provider.sendAsync(payload, callback)
                },
                simulationProjection
              )
          })
        )
        provider.start()
        nameResolution.start()
        proxy.start()
        // Images download only while the internet is open. Restarting the service retries what failed.
        disconnectCapabilities.push(
          internet.subscribe((open) => (open ? imageService.start() : imageService.dispose()))
        )
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
