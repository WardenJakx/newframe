import { expect, test } from 'bun:test'

import {
  checkAssetRateMutationAuthority,
  checkDependencyDirection,
  checkOperationContractAuthority,
  checkPlatformCommandAuthority,
  checkRawIpcAuthority,
  checkSource,
  extractModuleSpecifiers
} from './check-architecture'

type Check = (file: string, source: string) => string[]
type RejectCase = readonly [name: string, check: Check, file: string, source: string, message: string]

const renderer = 'apps/newframe/src/features/example/renderer/view.ts'
const contracts = 'apps/newframe/src/features/example/contract/schema.ts'
const domain = 'apps/newframe/src/features/example/domain/model.ts'
const mainService = 'apps/newframe/src/features/security/main/service.ts'
const rejects = (check: Check, file: string, source: string, message: string) =>
  expect(check(file, source).join('\n')).toContain(message)
const allows = (check: Check, file: string, source: string) => expect(check(file, source)).toEqual([])

test('extracts every supported static and dynamic module form', () => {
  const source = [
    "import '../main/side-effect'",
    "import value from '../main/default'",
    "import type { Value } from '../main/type'",
    "export { value } from '../main/export'",
    "export * from '../main/export-all'",
    "import('../main/dynamic')",
    "require('../main/require')"
  ].join('\n')
  expect(extractModuleSpecifiers(source).map(({ specifier }) => specifier)).toEqual([
    '../main/side-effect',
    '../main/default',
    '../main/type',
    '../main/export',
    '../main/export-all',
    '../main/dynamic',
    '../main/require'
  ])
})

// One row per protected authority makes omissions and duplicates visible.
// prettier-ignore
const authorityCases: RejectCase[] = [
  ['asset-rate writer', checkAssetRateMutationAuthority, 'apps/newframe/src/features/connections/main/provider/rates.ts', 'store.getState().setAssetRates(batch)', 'canonical asset-rate mutation is restricted'],
  ['duplicate operation catalog', checkOperationContractAuthority, 'apps/newframe/src/features/example/contract/operations.ts', 'export const querySchemas = {}', 'schema catalogs must be defined in src/app/contracts/operations.ts'],
  ['generic renderer RPC', checkOperationContractAuthority, 'apps/newframe/src/platform/ipc/contract/ipc.ts', "export const RpcChannel = 'newframe:rpc'", 'generic renderer RPC channels are forbidden'],
  ['command-specific results', checkOperationContractAuthority, 'apps/newframe/src/platform/ipc/renderer/link.ts', 'type Legacy = CommandResultMap', 'command-specific result maps are forbidden'],
  ['erased operation input', checkOperationContractAuthority, 'apps/newframe/src/features/settings/renderer/Settings.tsx', "link.executeCommand({ type: 'settings.update' } as any)", 'casting command or query payloads to any is forbidden'],
  ['wallet workflow import', checkOperationContractAuthority, 'apps/newframe/src/features/accounts/main/service.ts', "import { workflows } from '../../operations/walletWorkflows'", 'walletWorkflows facade imports and definitions are forbidden'],
  ['wallet workflow definition', checkOperationContractAuthority, 'apps/newframe/src/platform/operations/walletWorkflows.ts', 'export const workflows = {}', 'walletWorkflows facade imports and definitions are forbidden'],
  ['generic workflow', checkOperationContractAuthority, 'apps/newframe/src/platform/operations/sideTrayTransactions.ts', 'export const submit = () => undefined', 'generic operation workflow helpers are forbidden'],
  ['legacy context menu', checkPlatformCommandAuthority, 'apps/newframe/src/renderer/tray/index.tsx', "link.executeCommand({ type: 'tray.context-menu' })", 'renderer context menus must use renderer.context-menu'],
  ['migrated workflow forwarder', checkPlatformCommandAuthority, 'apps/newframe/src/platform/operations/walletWorkflows.ts', 'return { refreshPortfolio: () => refreshBalances() }', 'migrated passive and platform commands cannot return'],
  ['legacy account selection port', checkPlatformCommandAuthority, 'apps/newframe/src/platform/ipc/main/operations.ts', 'type OperationServices = { selectAccount: () => void }', 'account selection must be owned by the account service'],
  ['renderer execution', checkPlatformCommandAuthority, 'apps/newframe/src/features/transactions/send/renderer/index.tsx', "link.executeCommand({ type: 'transaction.submit' })", 'renderer execution capabilities are forbidden'],
  ['private Trade execution', checkPlatformCommandAuthority, 'apps/newframe/src/features/transactions/trade/renderer/tradeService.ts', 'const request = buildTradeSubmitRequest()', 'Trade renderer may retain only ticket, safe quote, review correlation'],
  ['legacy Send chain', checkPlatformCommandAuthority, 'apps/newframe/src/features/transactions/send/renderer/sendService.ts', "link.executeQuery({ type: 'name.resolve' })", 'Send must issue one send.submit intent'],
  ['renderer IPC', checkRawIpcAuthority, 'apps/newframe/src/app/renderer/tray/view.ts', 'ipcRenderer.invoke(channel)', 'raw ipcRenderer is restricted to the preload bridge'],
  ['main IPC', checkRawIpcAuthority, 'apps/newframe/src/features/accounts/main/service.ts', 'ipcMain.on(channel)', 'raw ipcMain access is restricted to typed IPC modules'],
  ['state publication', checkRawIpcAuthority, 'apps/newframe/src/features/accounts/main/service.ts', 'webContents.send(channel)', 'webContents.send is restricted to the typed state stream']
]

test.each(authorityCases)('rejects %s', (_name, check, file, source, message) => {
  rejects(check, file, source, message)
})

test('allows each canonical authority', () => {
  // Each rejection family has an explicit canonical owner or safe representation.
  // prettier-ignore
  const cases: readonly [Check, string, string][] = [
    [checkAssetRateMutationAuthority, 'apps/newframe/src/features/asset-data/main/assetRates/service.ts', 'state.setAssetRates(batch)'],
    [checkOperationContractAuthority, 'apps/newframe/src/app/contracts/operations.ts', 'export const commandContracts = {}'],
    [checkOperationContractAuthority, 'apps/newframe/src/features/accounts/contract/profile/schema.ts', 'export const ProfileCreateCommandSchema = z.object({})'],
    [checkPlatformCommandAuthority, 'apps/newframe/src/app/main/platform/service.ts', "command.type = 'renderer.context-menu'"],
    [checkPlatformCommandAuthority, 'apps/newframe/src/features/transactions/trade/renderer/index.tsx', 'const review = { safeQuote, operationId }'],
    [checkPlatformCommandAuthority, 'apps/newframe/src/features/transactions/send/renderer/index.tsx', "link.executeCommand({ type: 'send.submit' })"],
    [checkRawIpcAuthority, 'apps/newframe/src/preload/index.ts', 'ipcRenderer.invoke(channel)'],
    [checkRawIpcAuthority, 'apps/newframe/src/platform/ipc/main/operations.ts', 'ipcMain.handle(channel)'],
    [checkRawIpcAuthority, 'apps/newframe/src/platform/ipc/main/stateStream.ts', 'webContents.send(channel)']
  ]
  for (const [check, file, source] of cases) allows(check, file, source)
})

type SourceCase = readonly [string, string, string, string, string, string]
// Every per-source rule has both prohibited and canonical evidence in the same row.
// prettier-ignore
const sourceCases: SourceCase[] = [
  ['restore state dependency', domain, "import restore from 'react-restore'", 'Restore is not an application state dependency', domain, "import { produce } from 'immer'"],
  ['generic action channel', domain, "const channel = 'tray:action'", 'generic action and RPC channels are forbidden', domain, "const channel = 'newframe:command'"],
  ['generic RPC channel', domain, "const channel = 'main:rpc'", 'generic action and RPC channels are forbidden', domain, "const channel = 'newframe:query'"],
  ['unbranded internal trust', 'apps/newframe/src/features/example/main/service.ts', 'const trusted = __frameInternal', 'internal trust must be derived from a branded transport principal', 'apps/newframe/src/features/example/main/service.ts', 'const trusted = principal.internal'],
  ['raw renderer link', renderer, "link.invoke('channel')", 'renderer code must use typed commands, queries, and state connections', renderer, "link.executeCommand({ type: 'account.select' })"],
  ['non-Zustand renderer mirror', renderer, 'useSyncExternalStore(subscribe, snapshot)', 'renderer mirrors must use Zustand store mechanics', renderer, 'useWalletSelector(selectAccount)'],
  ['class component', renderer, 'class View extends React.Component {}', 'React components must be functions', renderer, 'function View() { return null }'],
  ['synchronous main IPC', 'apps/newframe/src/features/example/main/service.ts', 'ipcMain.on(channel)', 'application IPC must use typed asynchronous handlers', 'apps/newframe/src/platform/ipc/main/operations.ts', 'ipcMain.handle(channel)'],
  ['direct account request', 'apps/newframe/src/features/connections/main/provider/service.ts', 'account.addRequest(request)', 'production account requests must pass through accounts.routeRequest', 'apps/newframe/src/features/accounts/main/service.ts', 'account.addRequest(request)'],
  ['production test import', domain, "import value from './model.test.ts'", 'production code cannot import test files', domain, "import type { State } from './state'"],
  ['component CSS', 'apps/newframe/src/app/renderer/tray/View.css', '.view {}', 'component styles must be authored with Panda', 'apps/newframe/src/shared/legacy/View.css', '.view {}'],
  ['migrated raw element', 'apps/newframe/src/features/transactions/send/renderer/View.tsx', 'const view = <div />', 'migrated UI must render through packages/ui', 'apps/newframe/src/features/transactions/send/renderer/View.tsx', 'const view = <Stack />'],
  ['migrated style escape', 'apps/newframe/src/features/transactions/send/renderer/View.tsx', "const view = <Stack className='x' />", 'migrated UI cannot pass styling escape hatches', 'apps/newframe/src/features/transactions/send/renderer/View.tsx', "const view = <Stack gap='small' />"],
  ['composed UI directory', 'packages/ui/src/components/Panel.tsx', 'export const Panel = 1', 'packages/ui is reserved for primitives', 'packages/ui/src/primitives/Panel.tsx', 'export const Panel = 1'],
  ['UI application import', 'packages/ui/src/primitives/Button.tsx', "import App from '../../../apps/newframe/App'", 'packages/ui cannot import an application', 'packages/ui/src/primitives/Button.tsx', "import { Text } from './Text'"],
  ['nested primitive', 'packages/ui/src/primitives/forms/Button.tsx', 'export const Button = 1', 'UI primitives must be directly discoverable', 'packages/ui/src/primitives/Button.tsx', 'export const Button = 1'],
  ['primitive CSS', 'packages/ui/src/primitives/Button.css', '.button {}', 'primitive styles must be colocated', 'packages/ui/src/primitives/Button.tsx', 'export const Button = 1'],
  ['primitive composition import', 'packages/ui/src/primitives/Button.tsx', "import Panel from '../components/Panel'", 'UI primitives cannot depend on composed components', 'packages/ui/src/primitives/Button.tsx', "import { Text } from './Text'"],
  ['application-shaped variant', 'packages/ui/src/primitives/Button.tsx', 'type Mode = PanelVariant', 'UI primitives cannot expose application-shaped variant registries', 'packages/ui/src/primitives/Button.tsx', "type Mode = 'primary'"],
  ['inherited native props', 'packages/ui/src/primitives/Button.tsx', 'interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {}', 'UI props must opt into supported behavior', 'packages/ui/src/primitives/Button.tsx', 'interface Props { disabled?: boolean }'],
  ['legacy recipe runtime', 'packages/ui/src/primitives/Button.tsx', "import { cva } from 'class-variance-authority'", 'UI recipes must use the token-aware Panda runtime', 'packages/ui/src/primitives/Button.tsx', "import { cva } from '../styled-system/css'"],
  ['raw design unit', 'packages/ui/src/primitives/Button.tsx', "const style = { width: '12px' }", 'UI recipes must reference typed design tokens', 'packages/ui/src/primitives/Icon.tsx', "const style = { width: '12px' }"],
  ['local primitive typography', 'packages/ui/src/primitives/Button.tsx', "const style = { fontWeight: 'bold' }", 'primitives must compose the shared Text recipe', 'packages/ui/src/primitives/Text.tsx', "const style = { fontWeight: 'bold' }"],
  ['Stylus source', 'apps/newframe/src/app/renderer/legacy.styl', '.view\n  color red', 'Stylus is forbidden', 'apps/newframe/src/app/renderer/legacy.ts', 'export const view = true']
]

test.each(sourceCases)(
  'enforces and permits %s',
  (_name, badFile, badSource, message, goodFile, goodSource) => {
    rejects(checkSource, badFile, badSource, message)
    allows(checkSource, goodFile, goodSource)
  }
)

// The matrix is easier to audit with one process boundary per row.
// prettier-ignore
const layerCases = [
  [renderer, "import '../main/service'", 'renderer cannot import main'],
  [renderer, "export * from '../../../preload/bridge'", 'renderer cannot import preload'],
  ['apps/newframe/src/features/example/main/service.ts', "import '../renderer/view'", 'main cannot import renderer'],
  ['apps/newframe/src/features/example/main/service.ts', "export * from '../../../../generated/styles'", 'main cannot import generated'],
  ['apps/newframe/src/features/example/main/service.ts', "import '../../../preload/bridge'", 'main cannot import preload'],
  ['apps/newframe/src/preload/bridge.ts', "import '../features/example/domain/model'", 'preload may only import contracts'],
  ['apps/newframe/src/preload/bridge.ts', "import '../features/example/main/service'", 'preload may only import contracts'],
  ['apps/newframe/src/preload/bridge.ts', "import '../features/example/renderer/view'", 'preload may only import contracts'],
  [contracts, "import '../main/service'", 'contracts cannot import main'],
  [contracts, "import '../renderer/view'", 'contracts cannot import renderer'],
  [domain, "import '../../../preload/bridge'", 'domain cannot import preload'],
  [domain, "import '../../../../generated/styles'", 'domain cannot import generated']
] as const

test.each(layerCases)('rejects process-layer dependency direction from %s', (file, source, message) => {
  rejects(checkDependencyDirection, file, source, message)
})

test('rejects every supported renderer boundary bypass form and test fixture', () => {
  for (const source of [
    "void import('../main/service')",
    "require('../main/service')",
    "import 'apps/newframe/src/features/example/main/service'",
    "import '/workspace/apps/newframe/src/preload/bridge'",
    "import '@newframe/src/features/example/main/service'",
    "import '#newframe/src/preload/bridge'"
  ])
    rejects(
      checkDependencyDirection,
      renderer,
      source,
      source.includes('preload') ? 'renderer cannot import preload' : 'renderer cannot import main'
    )
  for (const file of [
    'apps/newframe/src/features/example/renderer/view.test.ts',
    'apps/newframe/src/platform/state-sync/renderer/fixtures.test-support.ts',
    'apps/newframe/src/features/example/renderer/__tests__/view.ts'
  ])
    rejects(
      checkDependencyDirection,
      file,
      "import 'apps/newframe/src/features/example/main/service'",
      'renderer cannot import main'
    )
})

test('rejects runtime dependencies from renderer and portable layers', () => {
  for (const specifier of 'electron node:crypto fs/promises path os util crypto buffer events process process/browser stream path-browserify crypto-browserify'.split(
    ' '
  ))
    rejects(
      checkDependencyDirection,
      renderer,
      `import '${specifier}'`,
      `renderer cannot import runtime dependency ${specifier}`
    )
  for (const [file, specifier] of [
    [contracts, 'react'],
    [contracts, 'zustand'],
    [contracts, 'electron'],
    [contracts, 'node:fs'],
    [contracts, 'buffer'],
    [domain, 'react-dom/client'],
    [domain, 'crypto'],
    [domain, 'events'],
    [domain, 'stream-browserify']
  ])
    rejects(
      checkDependencyDirection,
      file,
      `export * from '${specifier}'`,
      'cannot import runtime dependency'
    )
})

test('rejects broad singleton access through every supported import form and service root', () => {
  const message = 'must receive canonical store and production services through capability ports'
  // prettier-ignore
  const sources = [
    "import store from '../../../platform/state-store'",
    "import store from '../../../platform/state-store/'",
    "import type store from '../../../platform/state-store/index'",
    "export { default as store } from '../../../platform/state-store'",
    "export type { default as Store } from '../../../platform/state-store'",
    "void import('../../../platform/signing/signers')",
    "require('../../../platform/secrets/vault')",
    "import updater from 'apps/newframe/src/platform/app-update'",
    "import windows from '/workspace/apps/newframe/src/platform/desktop/windows'",
    "import biometrics from '@newframe/src/platform/secrets/biometrics'",
    "import persistence from '#newframe/src/platform/state-store/persist'"
  ]
  for (const source of sources) rejects(checkDependencyDirection, mainService, source, message)
  // prettier-ignore
  const cases = [
    ['apps/newframe/src/features/asset-data/main/externalData/index.ts', "import type store from '../../../../platform/state-store'"],
    ['apps/newframe/src/features/asset-data/main/images/index.ts', "import { openExternal } from '../../../../platform/desktop/windows/window'"],
    ['apps/newframe/src/platform/local-rpc/server.ts', "require('../desktop/windows/dialog')"],
    ['apps/newframe/src/features/transactions/main/simulation.ts', "void import('../../../platform/secrets/vault')"],
    ['apps/newframe/src/platform/ipc/main/operations.ts', "import('@newframe/src/platform/desktop/windows/sidetray')"],
    ['apps/newframe/src/features/accounts/main/service.ts', "import store from '../../../platform/state-store'"],
    ['apps/newframe/src/features/transactions/trade/main/service.ts', "import type store from '../../../../platform/state-store'"],
    ['apps/newframe/src/features/name-resolution/main/nameResolution.ts', "export * from '../../../platform/desktop/windows/window'"],
    ['apps/newframe/src/features/brand-new/main/service.ts', "import windows from '../../../platform/desktop/windows/window'"]
  ] as const
  for (const [file, source] of cases) rejects(checkDependencyDirection, file, source, message)
})

test('allows intended process dependencies and boundary owners', () => {
  // prettier-ignore
  const cases = [
    [renderer, "import type { State } from '../../../platform/state-sync/contract/projections'\nimport React from 'react'"],
    ['apps/newframe/src/features/example/main/service.ts', "import type { Command } from '../../../app/contracts/operations'\nimport path from 'node:path'"],
    ['apps/newframe/src/preload/bridge.ts', "import { contextBridge } from 'electron'\nimport type { Command } from '../app/contracts/operations'"],
    ['apps/newframe/src/features/security/main/service.test.ts', "import store from '../../../platform/state-store'"],
    ['apps/newframe/src/features/security/main/ports.test-support.ts', "import store from '../../../platform/state-store'"],
    ['apps/newframe/src/app/main/composition/production.ts', "import store from '../../../platform/state-store'\nimport signers from '../../../platform/signing'"],
    ['apps/newframe/src/features/connections/main/provider/infrastructure/production.ts', "import vault from '../../../../../platform/secrets/vault'\nimport windows from '../../../../../platform/desktop/windows'"],
    [mainService, "import type { CanonicalStore } from '../../../platform/state-store/actions'\nimport type Signer from '../../../platform/signing/signers/Signer'"],
    ['apps/newframe/src/app/main/index.ts', "import store from '../../platform/state-store'\nimport { openFileDialog } from '../../platform/desktop/windows/dialog'"],
    ['apps/newframe/src/platform/signing/signers/ledger/adapter.ts', "import type store from '../../../state-store'\nimport windows from '../../../desktop/windows'"]
  ] as const
  for (const [file, source] of cases) allows(checkDependencyDirection, file, source)
})
