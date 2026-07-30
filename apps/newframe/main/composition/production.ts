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
import { createSideTrayTransactionOperations } from '../operations/sideTrayTransactions.js'
import type { SideTrayTransactionService } from '../features/transactions/sideTrayService.js'
import {
  createSideTrayWorkflows,
  type SideTrayWindowCapability,
  type SideTrayWorkflows
} from '../operations/sideTrayWorkflows.js'
import { resolveName, selectAccount } from '../operations/workflows.js'
import { createWalletWorkflowOperations, type WalletWorkflowAdapters } from '../operations/walletWorkflows.js'
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
  agentService: AgentService
  imageService: ImageService
  rendererAuthorization: RendererAuthorizationRegistry
  sideTrayTransactions: SideTrayTransactionService
  sideTrayWorkflows: SideTrayWorkflows
  walletWorkflows: WalletWorkflowOperations
}

export interface ProductionAccountCapabilities {
  chainRpc: ReturnType<typeof createDeferredAccountChainRpcPort>
  transactionPolicy: ReturnType<typeof createDeferredAccountTransactionPolicyPort>
  simulation: ReturnType<typeof createDeferredTransactionSimulationPort>
}

export type WalletWorkflowOperations = ReturnType<typeof createWalletWorkflowOperations>
export type ProductionWalletWorkflowAdapters = WalletWorkflowAdapters
export interface ProductionCapabilityAdapters {
  accounts: AccountsRuntime
  images: ImageServiceAdapters
  sideTrayWindows: SideTrayWindowCapability
  walletWorkflows: ProductionWalletWorkflowAdapters
}

export function createProductionProvider(
  store: typeof import('../store/index.js').default,
  accounts: Accounts,
  chains: Chains,
  proxy: ProviderProxyConnection,
  reveal: RevealService
) {
  return new Provider({
    accounts,
    chains,
    proxy,
    state: createProviderStatePort(store),
    store,
    reveal
  })
}

export function createProductionCapabilities(
  store: typeof import('../store/index.js').default,
  adapters: ProductionCapabilityAdapters
) {
  const { walletWorkflows: walletAdapters } = adapters
  const proxy = createProviderProxyConnection()
  const nameResolution = createProductionNameResolutionService(proxy)
  const reveal = createRevealService(proxy, nameResolution)
  const accountCapabilities = {
    chainRpc: createDeferredAccountChainRpcPort(),
    transactionPolicy: createDeferredAccountTransactionPolicyPort(),
    simulation: createDeferredTransactionSimulationPort()
  }
  const accounts = new Accounts(store, {
    chainRpc: accountCapabilities.chainRpc.port,
    transactionPolicy: accountCapabilities.transactionPolicy.port,
    simulation: accountCapabilities.simulation.port,
    nameResolution,
    reveal,
    runtime: adapters.accounts,
    createDataScanner: createExternalDataScanner
  })
  const chains = new Chains(store)
  const provider = createProductionProvider(store, accounts, chains, proxy, reveal)
  const assetRateService = createAssetRateService({
    store,
    clock: { now: walletAdapters.now }
  })
  const flashService = createProductionFlashService(store, accounts, assetRateService)
  const agentService = createAgentService(accounts, flashService, store)
  const imageService = createImageService(store, adapters.images)
  const rendererAuthorization = createRendererAuthorizationRegistry()
  const sideTrayTransactions = createSideTrayTransactionOperations(
    provider,
    accounts,
    flashService,
    store,
    walletAdapters.now
  )
  const sideTrayWorkflows = createSideTrayWorkflows(adapters.sideTrayWindows)
  const walletWorkflows = createWalletWorkflowOperations({
    ...walletAdapters,
    accounts,
    assetRateService,
    chains,
    flashService,
    nameResolution,
    provider,
    proxy,
    reveal,
    store,
    transactionPolicy: accountCapabilities.transactionPolicy.port
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
    agentService,
    imageService,
    rendererAuthorization,
    sideTrayTransactions,
    sideTrayWorkflows,
    walletWorkflows
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
  sideTrayWorkflows: SideTrayWorkflows,
  walletWorkflows: WalletWorkflowOperations
): OperationServices {
  return {
    accounts,
    authorizeRenderer: rendererAuthorization.authorizeRenderer,
    createRendererPrincipal,
    requestTokenImage: imageService.requestTokenImage,
    resolveAgentAccessRequest: agentService.resolveAgentAccessRequest,
    revokeAgentSessions: agentService.revokeAgentSessions,
    setAgentAccess: agentService.setAgentAccess,
    closeOwnSideTray: sideTrayWorkflows.closeOwnSideTray,
    inspectOwnSideTray: sideTrayWorkflows.inspectOwnSideTray,
    quoteFlashForCurrentAccount: sideTrayTransactions.quoteFlashForCurrentAccount,
    signCurrentAccountTypedData: sideTrayTransactions.signCurrentAccountTypedData,
    submitCurrentAccountTransaction: sideTrayTransactions.submitCurrentAccountTransaction,
    submitFlashForCurrentAccount: sideTrayTransactions.submitFlashForCurrentAccount,
    resolveName: (name) => resolveName(name, nameResolution),
    selectAccount: (accountId) => selectAccount(accountId, accounts, provider),
    walletWorkflows
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
  agentService,
  imageService,
  rendererAuthorization,
  sideTrayTransactions,
  sideTrayWorkflows,
  walletWorkflows
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
      sideTrayWorkflows,
      walletWorkflows
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
        imageService.dispose()
        agentService.dispose()
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
      imageService.dispose()
      agentService.dispose()
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
