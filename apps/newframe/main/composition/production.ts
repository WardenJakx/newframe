import { Accounts } from '../accounts'
import createExternalDataScanner from '../externalData'
import type { AccountsRuntime } from '../accounts/runtime'
import { createDeferredAccountChainRpcPort, type AccountChainRpcPort } from '../accounts/providerPort'
import { createAgentService, type AgentService } from '../agent'
import { createRendererPrincipal } from '../authority'
import { Chains } from '../chains'
import { createProductionFlashService } from '../flash/instance'
import type { FlashService } from '../flash'
import { createProviderProxyConnection, type ProviderProxyConnection } from '../provider/proxy'
import { createProductionNameResolutionService, type NameResolutionService } from '../nameResolution'
import { createRevealService, type RevealService } from '../reveal'
import { createImageService, type ImageService, type ImageServiceAdapters } from '../images'
import { createRendererAuthorizationRegistry, type RendererAuthorizationRegistry } from '../ipc/authorization'
import { createOperationDispatcher, type IpcMainHandlerPort, type OperationServices } from '../ipc/operations'
import { createStateStream } from '../ipc/stateStream'
import { createSideTrayTransactionOperations } from '../operations/sideTrayTransactions'
import type { SideTrayTransactionService } from '../features/transactions/sideTrayService'
import {
  createSideTrayWorkflows,
  type SideTrayWindowCapability,
  type SideTrayWorkflows
} from '../operations/sideTrayWorkflows'
import { resolveName, selectAccount } from '../operations/workflows'
import { createWalletWorkflowOperations, type WalletWorkflowAdapters } from '../operations/walletWorkflows'
import { projectRendererState } from '../state/projections'
import type store from '../store'
import { Provider } from '../provider'
import { createProviderStatePort } from '../provider/statePort'
import type { PersistenceLifecycle } from '../infrastructure/persistence/ports'
import { createDeferredAccountTransactionPolicyPort } from '../features/transactions/accountPolicyPort'
import { createDeferredTransactionSimulationPort } from '../features/transactions/simulationPort'
import { maxFee, signerCompatibility } from '../transaction'
import { createTransactionSimulationProjection, simulateTransactionEffects } from '../transaction/simulation'
import { createMainApp, type MainApp } from './createMainApp'

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
  store: typeof import('../store').default,
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
  store: typeof import('../store').default,
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
  const flashService = createProductionFlashService(store, accounts)
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
