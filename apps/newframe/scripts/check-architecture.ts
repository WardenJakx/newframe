import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { builtinModules } from 'node:module'
import path from 'node:path'

const appRoot = path.resolve(import.meta.dirname, '..')
const repositoryRoot = path.resolve(appRoot, '../..')
const sourceExtensions = new Set(['.css', '.js', '.jsx', '.mjs', '.styl', '.ts', '.tsx'])

type SourceFile = { file: string; source: string }
type Rule = { files: (file: string) => boolean; pattern: RegExp; message: string }

async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  return (
    await Promise.all(
      entries.map((entry) => {
        const target = path.join(directory, entry.name)
        return entry.isDirectory() ? walk(target) : [target]
      })
    )
  ).flat()
}

async function sourceFiles() {
  const roots = [
    path.join(appRoot, 'src'),
    path.join(appRoot, 'test'),
    path.join(repositoryRoot, 'apps/newframe-extension/src')
  ]
  const optionalRoots = [path.join(repositoryRoot, 'packages')].filter(existsSync)
  const files = (await Promise.all([...roots, ...optionalRoots].map(walk)))
    .flat()
    .filter(
      (file) =>
        sourceExtensions.has(path.extname(file)) &&
        !file.includes(`${path.sep}dist${path.sep}`) &&
        !file.startsWith(path.join(appRoot, 'src', 'types') + path.sep) &&
        !file.includes(path.join('packages', 'ui', 'src', 'styled-system')) &&
        !file.includes(path.join('apps', 'newframe', 'generated', 'styled-system')) &&
        !file.includes(path.join('apps', 'newframe-extension', 'src', 'styled-system'))
    )
  const manifests = [
    path.join(repositoryRoot, 'package.json'),
    path.join(repositoryRoot, 'bun.lock'),
    path.join(appRoot, 'package.json'),
    path.join(repositoryRoot, 'apps/newframe-extension/package.json')
  ]

  return Promise.all(
    [...files, ...manifests].map(
      async (file): Promise<SourceFile> => ({
        file: path.relative(repositoryRoot, file),
        source: await readFile(file, 'utf8')
      })
    )
  )
}

const under = (directory: string) => (file: string) => file.startsWith(directory + path.sep)
const isTestFile = (file: string) => /(?:^|\/)[^/]+\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file)
const isTestSupportFile = (file: string) =>
  /(?:^|\/)(?:__mocks__|__tests__)(?:\/|$)/.test(file) ||
  /(?:^|\/)[^/]+\.(?:test-support|test-fixture)\./.test(file)
const isProductionFile = (file: string) => !isTestFile(file) && !isTestSupportFile(file)
const productionRenderer = (file: string) => isProductionFile(file) && layerFor(file) === 'renderer'
const productionMain = (file: string) => isProductionFile(file) && layerFor(file) === 'main'
const productionApplication = (file: string) =>
  isProductionFile(file) && under(path.join('apps', 'newframe', 'src'))(file)
const productionMainOutsideAccountGate = (file: string) =>
  productionMain(file) && !under(path.join('apps', 'newframe', 'src', 'features', 'accounts', 'main'))(file)
const anyFile = () => true
const migratedPilotFiles = new Set([
  path.join('apps', 'newframe', 'src', 'app', 'renderer', 'tray', 'Home', 'components', 'HomeHeaderView.tsx'),
  path.join('apps', 'newframe', 'src', 'app', 'renderer', 'tray', 'Home', 'components', 'HomeMenuView.tsx')
])
const migratedSharedSideTrayFiles = new Set([
  path.join('apps', 'newframe', 'src', 'shared', 'renderer', 'ui', 'ChainTokenIcon.tsx'),
  path.join(
    'apps',
    'newframe',
    'src',
    'features',
    'transactions',
    'trade',
    'renderer',
    'ui',
    'BalanceRange.tsx'
  ),
  path.join('apps', 'newframe', 'src', 'shared', 'renderer', 'ui', 'TokenOptionRow.tsx'),
  path.join('apps', 'newframe', 'src', 'shared', 'renderer', 'ui', 'TokenSelector.tsx')
])
const migratedSideTrayFiles = (file: string) =>
  path.dirname(file) ===
    path.join('apps', 'newframe', 'src', 'features', 'transactions', 'send', 'renderer') ||
  path.dirname(file) ===
    path.join('apps', 'newframe', 'src', 'features', 'transactions', 'trade', 'renderer') ||
  migratedSharedSideTrayFiles.has(file)
const extensionCompositionFiles = new Set([
  path.join('apps', 'newframe-extension', 'src', 'settings', 'ChoiceGrid.tsx'),
  path.join('apps', 'newframe-extension', 'src', 'settings', 'SettingsPanel.tsx')
])
const migratedExtensionSettingsFiles = (file: string) =>
  under(path.join('apps', 'newframe-extension', 'src', 'settings'))(file) &&
  !extensionCompositionFiles.has(file)
const uiSource = under(path.join('packages', 'ui', 'src'))
const primitiveRoot = path.join('packages', 'ui', 'src', 'primitives')

const restorePackage = ['react', 'restore'].join('-')
const genericActionChannel = ['tray', 'action'].join(':')
const genericRpcChannel = ['main', 'rpc'].join(':')
const rules: Rule[] = [
  {
    files: anyFile,
    pattern: new RegExp(`${restorePackage}|Restore\\.connect`),
    message: 'Restore is not an application state dependency'
  },
  {
    files: anyFile,
    pattern: new RegExp(`${genericActionChannel}|${genericRpcChannel}`),
    message: 'generic action and RPC channels are forbidden'
  },
  {
    files: anyFile,
    pattern: /__frameInternal/,
    message: 'internal trust must be derived from a branded transport principal'
  },
  {
    files: productionRenderer,
    pattern: /\blink\.(?:emit|invoke|on|rpc|send)\b|__NEWFRAME_HOST__\.(?:invoke|rpc|send)\b/,
    message: 'renderer code must use typed commands, queries, and state connections'
  },
  {
    files: productionRenderer,
    pattern: /\buseSyncExternalStore\b/,
    message: 'renderer mirrors must use Zustand store mechanics'
  },
  {
    files: productionRenderer,
    pattern: /\bclass\s+\w+\s+extends\s+(?:React\.)?(?:Pure)?Component\b/,
    message: 'React components must be functions'
  },
  {
    files: productionMain,
    pattern: /\bipcMain\.on\b/,
    message: 'application IPC must use typed asynchronous handlers'
  },
  {
    files: productionMainOutsideAccountGate,
    pattern: /\.addRequest\s*\(/,
    message: 'production account requests must pass through accounts.routeRequest'
  },
  {
    files: productionApplication,
    pattern:
      /(?:from\s*|import\s*\(|require\s*\()\s*['"][^'"]*(?:\.(?:test|spec|test-support|test-fixture)(?:\.|\/)|\/test\/)/,
    message: 'production code cannot import test files, fixtures, or support modules'
  }
]

function lineNumber(source: string, index: number) {
  return source.slice(0, index).split('\n').length
}

const applicationRoot = path.join('apps', 'newframe')
type ApplicationLayer = 'contracts' | 'domain' | 'generated' | 'main' | 'preload' | 'renderer'
const sourceRoot = path.join(applicationRoot, 'src')
const featureRendererRoot = path.join(sourceRoot, 'features')
const appRendererRoot = path.join(sourceRoot, 'app', 'renderer')
const rendererEntryRoot = path.join(sourceRoot, 'renderer')
const platformRoot = path.join(sourceRoot, 'platform')
const rawRendererLinkRoot = path.join(platformRoot, 'ipc', 'renderer', 'link')
const appRendererCapabilityRoot = path.join(appRendererRoot, 'capabilities')
const appUpdateRendererProduction = path.join(platformRoot, 'app-update', 'renderer', 'production.ts')
const featureRenderer = (file: string) =>
  under(featureRendererRoot)(file) && /(?:^|[\\/])renderer(?:[\\/]|$)/.test(file)
const singletonBoundaryExclusions = [
  path.join(sourceRoot, 'app', 'main', 'composition'),
  path.join(sourceRoot, 'features', 'connections', 'main', 'provider', 'infrastructure'),
  path.join(sourceRoot, 'platform', 'signing'),
  path.join(sourceRoot, 'platform', 'state-store'),
  path.join(sourceRoot, 'platform', 'app-update'),
  path.join(sourceRoot, 'platform', 'callbacks'),
  path.join(sourceRoot, 'platform', 'desktop'),
  path.join(sourceRoot, 'platform', 'persistence')
]
const applicationOwnedMainModule = (file: string) =>
  productionMain(file) &&
  file !== path.join(sourceRoot, 'app', 'main', 'index.ts') &&
  file !== path.join(sourceRoot, 'app', 'main', 'platform', 'production.ts') &&
  !/(?:accounts|asset-data|networks|portfolio|security|tokens)[\\/]main[\\/]production\.ts$/.test(file) &&
  !file.endsWith(path.join('asset-data', 'main', 'images', 'production.ts')) &&
  !file.endsWith(path.join('main', 'accountOnboarding', 'production.ts')) &&
  !singletonBoundaryExclusions.some((directory) => under(directory)(file))
const broadProductionServiceRoots = [
  path.join(sourceRoot, 'platform', 'secrets'),
  path.join(sourceRoot, 'platform', 'signing', 'signers'),
  path.join(sourceRoot, 'platform', 'state-store'),
  path.join(sourceRoot, 'platform', 'app-update'),
  path.join(sourceRoot, 'platform', 'desktop')
]
const narrowProductionTypeRoots = [
  path.join(sourceRoot, 'platform', 'signing', 'signers', 'Signer'),
  path.join(sourceRoot, 'platform', 'state-store', 'actions'),
  path.join(sourceRoot, 'platform', 'state-store', 'state')
]

const isModuleOrDescendant = (target: string, root: string) =>
  target === root || target.startsWith(`${root}${path.sep}`)

function isBroadProductionService(target: string) {
  const normalized = normalizedModuleRoot(target)
  if (narrowProductionTypeRoots.some((root) => isModuleOrDescendant(normalized, root))) return false
  return broadProductionServiceRoots.some((root) => isModuleOrDescendant(normalized, root))
}

function layerFor(file: string): ApplicationLayer | undefined {
  if (under(path.join(applicationRoot, 'generated'))(file)) return 'generated'
  if (under(path.join(sourceRoot, 'preload'))(file)) return 'preload'
  if (under(path.join(sourceRoot, 'renderer'))(file) || /(?:^|[\\/])renderer(?:[\\/]|$)/.test(file)) {
    return 'renderer'
  }
  if (under(path.join(sourceRoot, 'app', 'contracts'))(file) || /(?:^|[\\/])contract(?:[\\/]|$)/.test(file)) {
    return 'contracts'
  }
  if (
    /(?:^|[\\/])domain(?:[\\/]|$)/.test(file) ||
    normalizedModuleRoot(file) === path.join(sourceRoot, 'platform', 'operations', 'operation')
  ) {
    return 'domain'
  }
  if (under(sourceRoot)(file)) return 'main'
  return undefined
}

function importedApplicationPath(file: string, specifier: string): string | undefined {
  if (specifier.startsWith('.')) {
    return path.normalize(path.join(path.dirname(file), specifier))
  }

  const normalized = specifier.replaceAll('\\', '/')
  const applicationMarker = `${applicationRoot.replaceAll(path.sep, '/')}/`
  const markerIndex = normalized.indexOf(applicationMarker)
  if (markerIndex !== -1) {
    return path.normalize(normalized.slice(markerIndex))
  }

  const alias = normalized.match(
    /^(?:@newframe\/app|@newframe-app|@newframe|#newframe|@app)\/src(?:\/(.*))?$/
  )
  if (alias) return path.join(sourceRoot, alias[1] || '')

  return undefined
}

function importedLayer(file: string, specifier: string): ApplicationLayer | undefined {
  const target = importedApplicationPath(file, specifier)
  return target ? layerFor(target) : undefined
}

function normalizedModuleRoot(target: string) {
  const withoutTrailingSeparator = target.replace(/[\\/]+$/, '')
  const withoutExtension = withoutTrailingSeparator.replace(/\.(?:css|js|jsx|mjs|styl|ts|tsx)$/, '')
  return withoutExtension.endsWith(`${path.sep}index`)
    ? withoutExtension.slice(0, -`${path.sep}index`.length)
    : withoutExtension
}

const nodeBuiltinRoots = new Set(
  builtinModules.map((specifier) => specifier.replace(/^node:/, '').split('/')[0])
)
const nodePolyfillPackages = new Set([
  'browserify-fs',
  'crypto-browserify',
  'path-browserify',
  'process-browser',
  'stream-browserify'
])

function isNodeRuntimeSpecifier(specifier: string) {
  if (specifier.startsWith('node:')) return true
  const root = specifier.split('/')[0]
  return nodeBuiltinRoots.has(root) || nodePolyfillPackages.has(root)
}

function isPortableRuntimeSpecifier(specifier: string) {
  return (
    /^(?:electron(?:\/|$)|react(?:-dom)?(?:\/|$)|zustand(?:\/|$))/.test(specifier) ||
    isNodeRuntimeSpecifier(specifier)
  )
}

type ModuleSpecifier = { index: number; specifier: string }

export function extractModuleSpecifiers(source: string): ModuleSpecifier[] {
  const matches = source.matchAll(
    /\b(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\bfrom\s*)?(['"])([^'"]+)\1|\b(?:import|require)\s*\(\s*(['"])([^'"]+)\3\s*\)/g
  )

  return Array.from(matches, (match) => ({
    index: match.index,
    specifier: match[2] || match[4]
  }))
}

export function checkDependencyDirection(file: string, source: string) {
  const sourceLayer = layerFor(file)
  if (!sourceLayer) return []
  // Renderer tests and fixtures execute in the renderer project and must obey
  // the same process boundary as production renderer code. Otherwise a
  // test-only import can normalize or reintroduce coupling to main/preload.
  if (!isProductionFile(file) && sourceLayer !== 'renderer') return []
  const production = isProductionFile(file)

  const violations: string[] = []

  for (const moduleSpecifier of extractModuleSpecifiers(source)) {
    const { specifier } = moduleSpecifier
    const targetLayer = importedLayer(file, specifier)
    const target = importedApplicationPath(file, specifier)
    const line = lineNumber(source, moduleSpecifier.index)

    if (applicationOwnedMainModule(file) && target && isBroadProductionService(target)) {
      violations.push(
        `${file}:${line} application-owned main modules must receive canonical store and production services through capability ports`
      )
    }

    if (sourceLayer === 'renderer' && (targetLayer === 'main' || targetLayer === 'preload')) {
      violations.push(`${file}:${line} renderer cannot import ${targetLayer}`)
    }
    if (featureRenderer(file) && target && under(appRendererRoot)(target)) {
      violations.push(`${file}:${line} feature renderers cannot import app renderer modules`)
    }
    if (
      sourceLayer === 'main' &&
      (targetLayer === 'renderer' || targetLayer === 'preload' || targetLayer === 'generated')
    ) {
      violations.push(`${file}:${line} main cannot import ${targetLayer}`)
    }
    if (sourceLayer === 'preload' && targetLayer && targetLayer !== 'contracts') {
      violations.push(`${file}:${line} preload may only import contracts`)
    }
    if (
      production &&
      (sourceLayer === 'contracts' || sourceLayer === 'domain') &&
      targetLayer &&
      ['main', 'preload', 'renderer', 'generated'].includes(targetLayer)
    ) {
      violations.push(`${file}:${line} ${sourceLayer} cannot import ${targetLayer}`)
    }
    if (
      production &&
      (sourceLayer === 'contracts' || sourceLayer === 'domain') &&
      isPortableRuntimeSpecifier(specifier)
    ) {
      violations.push(`${file}:${line} ${sourceLayer} cannot import runtime dependency ${specifier}`)
    }
    if (
      production &&
      sourceLayer === 'renderer' &&
      (/^electron(?:\/|$)/.test(specifier) || isNodeRuntimeSpecifier(specifier))
    ) {
      violations.push(`${file}:${line} renderer cannot import runtime dependency ${specifier}`)
    }
    if (
      production &&
      sourceLayer === 'preload' &&
      !targetLayer &&
      !specifier.startsWith('.') &&
      specifier !== 'electron'
    ) {
      violations.push(`${file}:${line} preload may only import Electron and contracts`)
    }
  }

  return violations
}

export function checkAssetRateMutationAuthority(file: string, source: string) {
  if (!productionMain(file) || !/(?:\.\s*|\b)setAssetRates\s*\(/.test(source)) return []

  const allowed =
    under(path.join('apps', 'newframe', 'src', 'platform', 'state-store'))(file) ||
    file ===
      path.join('apps', 'newframe', 'src', 'features', 'asset-data', 'main', 'assetRates', 'service.ts')

  return allowed
    ? []
    : [`${file}: canonical asset-rate mutation is restricted to the asset-rate service and store`]
}

export function checkOperationContractAuthority(file: string, source: string) {
  if (!productionApplication(file)) return []

  const violations: string[] = []
  const canonicalCatalog = path.join('apps', 'newframe', 'src', 'app', 'contracts', 'operations.ts')
  const duplicateCatalog = source.match(
    /\b(?:command|query)(?:Contracts|Schemas|SchemaMap)\b\s*(?::[^=\n]+)?=/i
  )

  if (file !== canonicalCatalog && duplicateCatalog?.index !== undefined) {
    violations.push(
      `${file}:${lineNumber(source, duplicateCatalog.index)} command and query schema catalogs must be defined in src/app/contracts/operations.ts`
    )
  }

  const genericRendererRpc = source.match(
    /\b(?:execute|invoke|renderer)?RpcChannel\b\s*=|['"]newframe:(?:renderer-)?rpc['"]/i
  )
  if (genericRendererRpc?.index !== undefined) {
    violations.push(
      `${file}:${lineNumber(source, genericRendererRpc.index)} generic renderer RPC channels are forbidden; use typed commands and queries`
    )
  }

  const legacyCommandResult = source.match(
    /\b(?:CommandResultMap|ResultForCommand|WalletCommandResult(?:Schema)?)\b/
  )
  if (legacyCommandResult?.index !== undefined) {
    violations.push(
      `${file}:${lineNumber(source, legacyCommandResult.index)} commands must use the single generic CommandResult acknowledgement; command-specific result maps are forbidden`
    )
  }

  const legacyFacadePath = source.match(
    /['"][^'"]*(?:operations|infrastructure)\/walletWorkflows(?:\/production)?(?:\.[cm]?[jt]s)?['"]/
  )
  const legacyFacadeFile =
    /(?:^|\/)(?:operations|infrastructure)\/walletWorkflows(?:\/production)?\.ts$/.test(file)
  if (legacyFacadeFile || legacyFacadePath?.index !== undefined) {
    violations.push(
      `${file}:${lineNumber(source, legacyFacadePath?.index || 0)} walletWorkflows facade imports and definitions are forbidden; route through focused feature services and infrastructure ports`
    )
  }

  const genericWorkflowPath = source.match(
    /['"][^'"]*operations\/(?:workflows|sideTrayTransactions)(?:\.[cm]?[jt]s)?['"]/
  )
  const genericWorkflowFile = /(?:^|\/)operations\/(?:workflows|sideTrayTransactions)\.ts$/.test(file)
  if (genericWorkflowFile || genericWorkflowPath?.index !== undefined) {
    violations.push(
      `${file}:${lineNumber(source, genericWorkflowPath?.index || 0)} generic operation workflow helpers are forbidden; move orchestration to a focused feature service or infrastructure adapter`
    )
  }

  if (productionRenderer(file)) {
    const erasedOperationType = source.match(/\bexecute(?:Command|Query)\s*\([^;\n]*?\bas\s+any\b/)
    if (erasedOperationType?.index !== undefined) {
      violations.push(
        `${file}:${lineNumber(source, erasedOperationType.index)} renderer operations must retain their catalog-derived input type; casting command or query payloads to any is forbidden`
      )
    }
  }

  return violations
}

export function checkRawIpcAuthority(file: string, source: string) {
  const violations: string[] = []
  if (productionRenderer(file) && /\bipcRenderer\b/.test(source)) {
    violations.push(`${file}: raw ipcRenderer is restricted to the preload bridge`)
  }

  if (productionMain(file)) {
    const rawMainIpc = source.match(/\bipcMain\.(?:addListener|emit|handle|invoke|on|once|send)\b/)
    if (rawMainIpc?.index !== undefined) {
      const allowed = new Set([
        path.join('apps', 'newframe', 'src', 'platform', 'ipc', 'main', 'operations.ts'),
        path.join('apps', 'newframe', 'src', 'platform', 'ipc', 'main', 'stateStream.ts')
      ])
      if (!allowed.has(file)) {
        violations.push(`${file}: raw ipcMain access is restricted to typed IPC modules`)
      }
    }

    if (/\bwebContents\.send\b/.test(source)) {
      const stateStream = path.join('apps', 'newframe', 'src', 'platform', 'ipc', 'main', 'stateStream.ts')
      if (file !== stateStream) {
        violations.push(`${file}: webContents.send is restricted to the typed state stream`)
      }
    }
  }
  return violations
}

function isRendererTransportComposition(file: string) {
  return (
    under(rendererEntryRoot)(file) ||
    under(appRendererCapabilityRoot)(file) ||
    normalizedModuleRoot(file) === rawRendererLinkRoot ||
    file === appUpdateRendererProduction
  )
}

export function checkRendererTransportAuthority(file: string, source: string) {
  if (!productionRenderer(file)) return []

  const violations: string[] = []
  for (const moduleSpecifier of extractModuleSpecifiers(source)) {
    const target = importedApplicationPath(file, moduleSpecifier.specifier)
    if (!target || normalizedModuleRoot(target) !== rawRendererLinkRoot) continue
    if (isRendererTransportComposition(file)) continue
    violations.push(
      `${file}:${lineNumber(source, moduleSpecifier.index)} raw renderer IPC link imports are restricted to renderer bootstrap and focused app/platform composition adapters`
    )
  }

  const explicitAny = source.match(
    /(?:\bas\s+|:\s*|<\s*|,\s*|\|\s*|&\s*|\(\s*|\[\s*|=\s*)any\b|\bany\s*(?:\[\]|[>,;)=|&])/
  )
  if (explicitAny?.index !== undefined) {
    violations.push(
      `${file}:${lineNumber(source, explicitAny.index)} production renderer code cannot use explicit any; preserve boundary types or narrow unknown`
    )
  }

  return violations
}

export function checkPlatformCommandAuthority(file: string, source: string) {
  if (!productionApplication(file)) return []

  const violations: string[] = []
  const tradeRenderer = path.join('apps', 'newframe', 'src', 'features', 'transactions', 'trade', 'renderer')
  const sendRenderer = path.join('apps', 'newframe', 'src', 'features', 'transactions', 'send', 'renderer')
  if (productionRenderer(file)) {
    const rendererExecutionCapability = source.match(
      /type\s*:\s*['"](?:transaction\.submit|typedData\.signV4|flash\.submit)['"]|['"](?:transaction\.submit|typedData\.signV4|flash\.submit)['"]\s*:/
    )
    if (rendererExecutionCapability?.index !== undefined) {
      violations.push(
        `${file}:${lineNumber(source, rendererExecutionCapability.index)} renderer execution capabilities are forbidden; use a main-owned feature workflow`
      )
    }
  }
  if (productionRenderer(file) && under(tradeRenderer)(file)) {
    const privateTradeExecution = source.match(
      /\b(?:buildTradeActionRequest|buildTradeSignatureRequest|buildTradePermitSignatureRequest|buildTradeSubmitRequest|flashPayload|orderSignature|permitSignature)\b/
    )
    if (privateTradeExecution?.index !== undefined) {
      violations.push(
        `${file}:${lineNumber(source, privateTradeExecution.index)} Trade renderer may retain only ticket, safe quote, review correlation, and projected operation state`
      )
    }
  }
  if (productionRenderer(file) && under(sendRenderer)(file)) {
    const legacySendChain = source.match(
      /type\s*:\s*['"]name\.resolve['"]|\b(?:resolveName|submitTransaction)\s*\(/
    )
    if (legacySendChain?.index !== undefined) {
      violations.push(
        `${file}:${lineNumber(source, legacySendChain.index)} Send must issue one send.submit intent and observe projected operation/activity state`
      )
    }
  }
  const legacyContextMenu = source.match(
    /['"](?:tray|sidetray)\.context-menu['"]|\b(?:Tray|SideTray)ContextMenu/
  )
  if (legacyContextMenu?.index !== undefined) {
    violations.push(
      `${file}:${lineNumber(source, legacyContextMenu.index)} renderer context menus must use renderer.context-menu`
    )
  }

  const walletWorkflow = path.join('apps', 'newframe', 'src', 'platform', 'operations', 'walletWorkflows.ts')
  if (file === walletWorkflow) {
    const migratedForwarder = source.match(
      /\b(?:addAccountFromSigner|addToken|addWatchAccount|adjustTransactionNonce|clearPermission|configureSecurity|consumeHomeCommand|createLatticeSigner|disconnectSigner|dismissTransactionFeeNotice|handleTrayMouseout|importSigner|inspectOwnTrayWindow|loadLedgerAccounts|locateKeystore|lockWallet|navigatePanelBack|openExternalUrl|openRequestPanel|openSideTray|openTransactionExplorer|pairLattice|quitApp|refreshPortfolio|reloadSigner|removeAccount|removeToken|renameAccount|reorderAccounts|resetTransactionNonce|resetWallet|respondToExtension|respondToUpdater|securityStatus|setNetworkActivation|setNetworkPrimaryRpc|setTransactionFeeDefault|submitTrezorInput|toggleWarning|unlockSecurity|updateNotification|updateSettings|updateTokenApproval|updateTransactionFee|writeClipboard)\s*(?=[:,=(])/
    )
    if (migratedForwarder?.index !== undefined) {
      violations.push(
        `${file}:${lineNumber(source, migratedForwarder.index)} migrated passive and platform commands cannot return to walletWorkflows`
      )
    }
  }

  const operationsIpc = path.join('apps', 'newframe', 'src', 'platform', 'ipc', 'main', 'operations.ts')
  if (file === operationsIpc) {
    const legacySelectionPort = source.match(/\bselectAccount\s*:/)
    if (legacySelectionPort?.index !== undefined) {
      violations.push(
        `${file}:${lineNumber(source, legacySelectionPort.index)} account selection must be owned by the account service`
      )
    }
  }

  return violations
}

export function checkSource(file: string, source: string) {
  const violations = [
    ...checkDependencyDirection(file, source),
    ...checkAssetRateMutationAuthority(file, source),
    ...checkOperationContractAuthority(file, source),
    ...checkPlatformCommandAuthority(file, source),
    ...checkRawIpcAuthority(file, source),
    ...checkRendererTransportAuthority(file, source)
  ]

  for (const rule of rules) {
    if (!rule.files(file)) continue
    const match = source.match(rule.pattern)
    if (match?.index !== undefined)
      violations.push(`${file}:${lineNumber(source, match.index)} ${rule.message}`)
  }

  if (
    file.endsWith('.css') &&
    (uiSource(file) ||
      productionRenderer(file) ||
      under(path.join('apps', 'newframe-extension', 'src', 'settings'))(file))
  ) {
    violations.push(`${file}: component styles must be authored with Panda in the owning TypeScript file`)
  }

  if (migratedPilotFiles.has(file) || migratedSideTrayFiles(file) || migratedExtensionSettingsFiles(file)) {
    const rawElement = source.match(
      /<(?:a|button|canvas|div|footer|form|h[1-6]|header|img|input|label|main|option|output|p|section|select|small|span|strong|svg|table|textarea)\b/
    )
    if (rawElement?.index !== undefined) {
      violations.push(
        `${file}:${lineNumber(source, rawElement.index)} migrated UI must render through packages/ui`
      )
    }
    const stylingEscape = source.match(/\b(?:className|style)=/)
    if (stylingEscape?.index !== undefined) {
      violations.push(
        `${file}:${lineNumber(source, stylingEscape.index)} migrated UI cannot pass styling escape hatches`
      )
    }
  }

  if (uiSource(file)) {
    if (under(path.join('packages', 'ui', 'src', 'components'))(file)) {
      violations.push(
        `${file}: packages/ui is reserved for primitives; application compositions belong to their owning app`
      )
    }

    const applicationImport = source.match(
      /from\s+['"][^'"]*(?:apps\/newframe|apps\/newframe-extension)['"]|from\s+['"][.]{2}\/[^'"]*apps\//
    )
    if (applicationImport?.index !== undefined) {
      violations.push(
        `${file}:${lineNumber(source, applicationImport.index)} packages/ui cannot import an application`
      )
    }

    if (under(path.join('packages', 'ui', 'src', 'primitives'))(file)) {
      if (path.dirname(file) !== primitiveRoot) {
        violations.push(`${file}: UI primitives must be directly discoverable in src/primitives`)
      }

      if (file.endsWith('.css')) {
        violations.push(`${file}: primitive styles must be colocated in the component TypeScript file`)
      }

      const componentImport = source.match(/from\s+['"][^'"]*components\//)
      if (componentImport?.index !== undefined) {
        violations.push(
          `${file}:${lineNumber(source, componentImport.index)} UI primitives cannot depend on composed components`
        )
      }
    }

    const legacyVariantRegistry = source.match(/\b(?:AssetSelectorVariant|PanelVariant)\b/)
    if (legacyVariantRegistry?.index !== undefined) {
      violations.push(
        `${file}:${lineNumber(source, legacyVariantRegistry.index)} UI primitives cannot expose application-shaped variant registries`
      )
    }

    const inheritedNativeProps = source.match(
      /\b(?:HTMLAttributes|ButtonHTMLAttributes|InputHTMLAttributes|SelectHTMLAttributes|ImgHTMLAttributes|AnchorHTMLAttributes)\s*</
    )
    if (inheritedNativeProps?.index !== undefined) {
      violations.push(
        `${file}:${lineNumber(source, inheritedNativeProps.index)} UI props must opt into supported behavior instead of inheriting native element props`
      )
    }

    const legacyRecipe = source.match(/from\s+['"]class-variance-authority['"]/)
    if (legacyRecipe?.index !== undefined) {
      violations.push(
        `${file}:${lineNumber(source, legacyRecipe.index)} UI recipes must use the token-aware Panda runtime`
      )
    }

    if (
      file.endsWith('.css') ||
      (under(primitiveRoot)(file) && file.endsWith('.tsx') && file !== path.join(primitiveRoot, 'Icon.tsx'))
    ) {
      const rawUnit = source.match(/(?<![A-Za-z0-9_-])-?\d+(?:\.\d+)?(?:px|rem|em|ms|s|deg)\b/)
      if (rawUnit?.index !== undefined) {
        violations.push(
          `${file}:${lineNumber(source, rawUnit.index)} UI recipes must reference typed design tokens instead of raw unit values`
        )
      }
    }

    const componentTypography = source.match(/\bfont(?:Family|Size|Weight)\s*:/)
    if (
      componentTypography?.index !== undefined &&
      under(primitiveRoot)(file) &&
      file !== path.join(primitiveRoot, 'Text.tsx')
    ) {
      violations.push(
        `${file}:${lineNumber(source, componentTypography.index)} primitives must compose the shared Text recipe`
      )
    }
  }

  if (file.endsWith('.styl')) {
    violations.push(`${file}: Stylus is forbidden; migrate the owning surface to the design system`)
  }

  return violations
}

async function main() {
  for (const removedRoot of ['app', 'resources']) {
    if (existsSync(path.join(appRoot, removedRoot))) {
      console.error(`Architecture violation: ambiguous legacy root still exists: ${removedRoot}`)
      process.exit(1)
    }
  }

  const files = await sourceFiles()
  const violations: string[] = []

  for (const { file, source } of files) {
    violations.push(...checkSource(file, source))
  }

  if (violations.length === 0) return
  console.error(`Architecture violations:\n${violations.map((violation) => `- ${violation}`).join('\n')}`)
  process.exit(1)
}

if (import.meta.main) {
  void main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
