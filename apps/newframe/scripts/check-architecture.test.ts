import { describe, expect, it } from 'bun:test'

import { checkDependencyDirection, extractModuleSpecifiers } from './check-architecture'

const rendererFile = 'apps/newframe/renderer/feature/view.ts'
const contractsFile = 'apps/newframe/contracts/feature/schema.ts'
const domainFile = 'apps/newframe/domain/feature/model.ts'

describe('architecture import extraction', () => {
  it('recognizes every supported module-loading syntax', () => {
    const source = [
      "import '../main/side-effect'",
      "import value from '../main/default'",
      "import type { Value } from '../main/type'",
      "export { value } from '../main/export'",
      "export * from '../main/export-all'",
      "const lazy = import('../main/dynamic')",
      "const loaded = require('../main/require')"
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
})

describe('architecture dependency direction', () => {
  it.each([
    ["import '../../main/service'", 'renderer cannot import main'],
    ["import '../../preload/bridge'", 'renderer cannot import preload'],
    ["export * from '../../main/service'", 'renderer cannot import main'],
    ["void import('../../main/service')", 'renderer cannot import main'],
    ["require('../../main/service')", 'renderer cannot import main'],
    ["import 'apps/newframe/main/service'", 'renderer cannot import main'],
    ["import '/workspace/apps/newframe/preload/bridge'", 'renderer cannot import preload'],
    ["import '@newframe/main/service'", 'renderer cannot import main'],
    ["import '#newframe/preload/bridge'", 'renderer cannot import preload']
  ])('rejects renderer boundary bypass: %s', (source, message) => {
    expect(checkDependencyDirection(rendererFile, source)).toContain(`${rendererFile}:1 ${message}`)
  })

  it.each([
    'apps/newframe/renderer/feature/view.test.ts',
    'apps/newframe/renderer/state/fixtures.test-support.ts',
    'apps/newframe/renderer/__tests__/view.ts'
  ])('enforces the main boundary for renderer test/support file %s', (file) => {
    expect(checkDependencyDirection(file, "import value from '../../main/service'")).toContain(
      `${file}:1 renderer cannot import main`
    )
  })

  it.each([
    [
      'apps/newframe/main/feature/service.ts',
      "import '../../renderer/feature/view'",
      'main cannot import renderer'
    ],
    [
      'apps/newframe/main/feature/service.ts',
      "export * from '../../generated/styles'",
      'main cannot import generated'
    ],
    ['apps/newframe/main/feature/service.ts', "import '../../preload/bridge'", 'main cannot import preload'],
    [
      'apps/newframe/preload/bridge.ts',
      "import '../domain/feature/model'",
      'preload may only import contracts'
    ],
    [
      'apps/newframe/preload/bridge.ts',
      "import '../main/feature/service'",
      'preload may only import contracts'
    ],
    [
      'apps/newframe/preload/bridge.ts',
      "import '../renderer/feature/view'",
      'preload may only import contracts'
    ],
    ['apps/newframe/preload/bridge.ts', "import '../generated/styles'", 'preload may only import contracts'],
    [contractsFile, "import '../../main/feature/service'", 'contracts cannot import main'],
    [contractsFile, "import '../../preload/bridge'", 'contracts cannot import preload'],
    [contractsFile, "import '../../renderer/feature/view'", 'contracts cannot import renderer'],
    [contractsFile, "import '../../generated/styles'", 'contracts cannot import generated'],
    [domainFile, "import '../../main/feature/service'", 'domain cannot import main'],
    [domainFile, "import '../../preload/bridge'", 'domain cannot import preload'],
    [domainFile, "import '../../renderer/feature/view'", 'domain cannot import renderer'],
    [domainFile, "import '../../generated/styles'", 'domain cannot import generated']
  ])('rejects %s crossing its boundary', (file, source, message) => {
    expect(checkDependencyDirection(file, source)).toContain(`${file}:1 ${message}`)
  })

  it.each([
    'electron',
    'node:crypto',
    'fs/promises',
    'path',
    'os',
    'util',
    'crypto',
    'buffer',
    'events',
    'process',
    'process/browser',
    'stream',
    'path-browserify',
    'crypto-browserify'
  ])('rejects Node runtime or polyfill %s from renderer', (specifier) => {
    expect(checkDependencyDirection(rendererFile, `import '${specifier}'`)).toContain(
      `${rendererFile}:1 renderer cannot import runtime dependency ${specifier}`
    )
  })

  it.each([
    [contractsFile, 'react'],
    [contractsFile, 'zustand'],
    [contractsFile, 'electron'],
    [contractsFile, 'node:fs'],
    [contractsFile, 'buffer'],
    [domainFile, 'react-dom/client'],
    [domainFile, 'crypto'],
    [domainFile, 'events'],
    [domainFile, 'stream-browserify']
  ])('rejects runtime dependency %s from portable layer', (file, specifier) => {
    expect(checkDependencyDirection(file, `export * from '${specifier}'`)).toContain(
      `${file}:1 ${file.includes('/contracts/') ? 'contracts' : 'domain'} cannot import runtime dependency ${specifier}`
    )
  })

  it('allows each layer to use its intended dependencies', () => {
    expect(
      checkDependencyDirection(
        rendererFile,
        "import type { State } from '../../contracts/state/projections'\nimport React from 'react'"
      )
    ).toEqual([])
    expect(
      checkDependencyDirection(
        'apps/newframe/main/feature/service.ts',
        "import type { Command } from '../../contracts/operations'\nimport path from 'node:path'"
      )
    ).toEqual([])
    expect(
      checkDependencyDirection(
        'apps/newframe/preload/bridge.ts',
        "import { contextBridge } from 'electron'\nimport type { Command } from '../contracts/operations'"
      )
    ).toEqual([])
  })

  it.each([
    ['apps/newframe/main/features/security/service.ts', "import store from '../../store'"],
    ['apps/newframe/main/features/security/service.ts', "import store from '../../store/'"],
    ['apps/newframe/main/features/security/service.ts', "import type store from '../../store/index'"],
    ['apps/newframe/main/features/security/service.ts', "export { default as store } from '../../store'"],
    [
      'apps/newframe/main/features/security/service.ts',
      "export type { default as Store } from '../../store'"
    ],
    ['apps/newframe/main/features/security/service.ts', "void import('../../signers')"],
    ['apps/newframe/main/features/security/service.ts', "require('../../vault')"],
    ['apps/newframe/main/features/security/service.ts', "import updater from 'apps/newframe/main/updater'"],
    [
      'apps/newframe/main/features/security/service.ts',
      "import windows from '/workspace/apps/newframe/main/windows'"
    ],
    ['apps/newframe/main/features/security/service.ts', "import biometrics from '@newframe/main/biometrics'"],
    [
      'apps/newframe/main/features/security/service.ts',
      "import persistence from '#newframe/main/store/persist'"
    ],
    ['apps/newframe/main/operations/walletWorkflows.ts', "import type store from '../store'"],
    ['apps/newframe/main/externalData/index.ts', "import type store from '../store'"],
    ['apps/newframe/main/images/index.ts', "import { openExternal } from '../windows/window'"],
    ['apps/newframe/main/tokens.ts', "export * from './signers/ledger/adapter'"],
    ['apps/newframe/main/agent/index.ts', "import updater from '../updater'"],
    ['apps/newframe/main/api/server.ts', "require('../windows/dialog')"],
    ['apps/newframe/main/transaction/simulation.ts', "void import('../vault')"],
    ['apps/newframe/main/state/projections.ts', "import '../store/persist/schema'"],
    ['apps/newframe/main/ipc/operations.ts', "import('@newframe/main/windows/sidetray')"],
    ['apps/newframe/main/requests/route.ts', "export * from '#newframe/main/signers/trezor/adapter'"],
    ['apps/newframe/main/accounts/service.ts', "import store from '../store'"],
    ['apps/newframe/main/chains/service.ts', "import updater from '../updater'"],
    ['apps/newframe/main/provider/service.ts', "import windows from '../windows/window'"],
    ['apps/newframe/main/flash/service.ts', "import type store from '../store'"],
    ['apps/newframe/main/portfolio/service.ts', "import('../signers/ledger/adapter')"],
    ['apps/newframe/main/network/service.ts', "require('../vault')"],
    ['apps/newframe/main/nameResolution.ts', "export * from './windows/window'"],
    ['apps/newframe/main/reveal.ts', "import biometrics from './biometrics'"],
    ['apps/newframe/main/provider/proxy.ts', "import '#newframe/main/store/persist'"],
    ['apps/newframe/main/brandNewFeature/service.ts', "import windows from '../windows/window'"]
  ])('rejects singleton access from %s via %s', (file, source) => {
    expect(checkDependencyDirection(file, source)).toContain(
      `${file}:1 application-owned main modules must receive canonical store and production services through capability ports`
    )
  })

  it.each([
    ['apps/newframe/main/features/security/service.test.ts', "import store from '../../store'"],
    ['apps/newframe/main/features/security/ports.test-support.ts', "import store from '../../store'"],
    ['apps/newframe/main/features/security/__tests__/fixture.ts', "import store from '../../store'"],
    [
      'apps/newframe/main/composition/production.ts',
      "import store from '../store'\nimport signers from '../signers'"
    ],
    [
      'apps/newframe/main/infrastructure/walletWorkflows/production.ts',
      "import vault from '../../vault'\nimport windows from '../../windows'"
    ],
    [
      'apps/newframe/main/features/security/service.ts',
      [
        "import type { CanonicalStore } from '../../store/actions'",
        "import type Signer from '../../signers/Signer'",
        "import type { SecurityUnlockCommand } from '../../../contracts/operations'"
      ].join('\n')
    ],
    [
      'apps/newframe/main/externalData/index.ts',
      "import type { CanonicalStoreReader } from '../store/actions'\nimport type { Token } from '../store/state'"
    ],
    [
      'apps/newframe/main/transaction/model.ts',
      "import type { Gas } from '../store/state'\nimport type Signer from '../signers/Signer'"
    ],
    [
      'apps/newframe/main/index.ts',
      "import store from './store'\nimport { openFileDialog } from './windows/dialog'"
    ],
    [
      'apps/newframe/main/signers/ledger/adapter.ts',
      "import type store from '../../store'\nimport windows from '../../windows'"
    ],
    ['apps/newframe/main/windows/window.ts', "import store from '../store'\nimport updater from '../updater'"]
  ])('allows narrow or boundary-owned dependencies in %s', (file, source) => {
    expect(checkDependencyDirection(file, source)).toEqual([])
  })
})
