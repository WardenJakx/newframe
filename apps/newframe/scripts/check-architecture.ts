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
    path.join(appRoot, 'main'),
    path.join(appRoot, 'preload'),
    path.join(appRoot, 'renderer'),
    path.join(appRoot, 'contracts'),
    path.join(appRoot, 'domain'),
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
const productionRenderer = (file: string) =>
  isProductionFile(file) && under(path.join('apps', 'newframe', 'renderer'))(file)
const productionMain = (file: string) =>
  isProductionFile(file) && under(path.join('apps', 'newframe', 'main'))(file)
const productionApplication = (file: string) =>
  isProductionFile(file) &&
  ['contracts', 'domain', 'main', 'preload', 'renderer'].some((root) =>
    under(path.join('apps', 'newframe', root))(file)
  )
const productionMainOutsideAccountGate = (file: string) =>
  productionMain(file) && !under(path.join('apps', 'newframe', 'main', 'accounts'))(file)
const anyFile = () => true
const migratedPilotFiles = new Set([
  path.join('apps', 'newframe', 'renderer', 'tray', 'Home', 'components', 'HomeHeaderView.tsx'),
  path.join('apps', 'newframe', 'renderer', 'tray', 'Home', 'components', 'HomeMenuView.tsx')
])
const migratedSharedSideTrayFiles = new Set([
  path.join('apps', 'newframe', 'renderer', 'shared', 'ui', 'ChainTokenIcon.tsx'),
  path.join('apps', 'newframe', 'renderer', 'shared', 'ui', 'BalanceRange.tsx'),
  path.join('apps', 'newframe', 'renderer', 'shared', 'ui', 'TokenOptionRow.tsx'),
  path.join('apps', 'newframe', 'renderer', 'shared', 'ui', 'TokenSelector.tsx')
])
const migratedSideTrayFiles = (file: string) =>
  under(path.join('apps', 'newframe', 'renderer', 'sidetray'))(file) || migratedSharedSideTrayFiles.has(file)
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
const applicationLayers = ['contracts', 'domain', 'generated', 'main', 'preload', 'renderer'] as const
type ApplicationLayer = (typeof applicationLayers)[number]
const mainRoot = path.join(applicationRoot, 'main')
const singletonBoundaryExclusions = [
  'composition',
  'infrastructure',
  'signers',
  'store',
  'updater',
  'windows'
]
const applicationOwnedMainModule = (file: string) =>
  productionMain(file) &&
  file !== path.join(mainRoot, 'index.ts') &&
  !singletonBoundaryExclusions.some((directory) => under(path.join(mainRoot, directory))(file))
const broadProductionServiceRoots = ['biometrics', 'signers', 'store', 'updater', 'vault', 'windows'].map(
  (module) => path.join(mainRoot, module)
)
const narrowProductionTypeRoots = [
  path.join(mainRoot, 'signers', 'Signer'),
  path.join(mainRoot, 'store', 'actions'),
  path.join(mainRoot, 'store', 'state')
]

const isModuleOrDescendant = (target: string, root: string) =>
  target === root || target.startsWith(`${root}${path.sep}`)

function isBroadProductionService(target: string) {
  const normalized = normalizedModuleRoot(target)
  if (narrowProductionTypeRoots.some((root) => isModuleOrDescendant(normalized, root))) return false
  return broadProductionServiceRoots.some((root) => isModuleOrDescendant(normalized, root))
}

function layerFor(file: string): ApplicationLayer | undefined {
  return applicationLayers.find((layer) => under(path.join(applicationRoot, layer))(file))
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
    /^(?:@newframe\/app|@newframe-app|@newframe|#newframe|@app)\/(contracts|domain|generated|main|preload|renderer)(?:\/(.*))?$/
  )
  if (alias) return path.join(applicationRoot, alias[1], alias[2] || '')

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
    under(path.join('apps', 'newframe', 'main', 'store'))(file) ||
    file === path.join('apps', 'newframe', 'main', 'features', 'assetRates', 'service.ts')

  return allowed
    ? []
    : [`${file}: canonical asset-rate mutation is restricted to the asset-rate service and store`]
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
    violations.push(...checkDependencyDirection(file, source))
    violations.push(...checkAssetRateMutationAuthority(file, source))
    for (const rule of rules) {
      if (!rule.files(file)) continue
      const match = source.match(rule.pattern)
      if (match?.index !== undefined)
        violations.push(`${file}:${lineNumber(source, match.index)} ${rule.message}`)
    }

    if (productionRenderer(file) && /\bipcRenderer\b/.test(source)) {
      violations.push(`${file}: raw ipcRenderer is restricted to the preload bridge`)
    }

    if (
      file.endsWith('.css') &&
      (uiSource(file) ||
        under(path.join('apps', 'newframe', 'renderer', 'tray'))(file) ||
        under(path.join('apps', 'newframe', 'renderer', 'shared', 'ui'))(file) ||
        under(path.join('apps', 'newframe-extension', 'src', 'settings'))(file))
    ) {
      violations.push(`${file}: component styles must be authored with Panda in the owning TypeScript file`)
    }

    if (/\bipcMain\.handle\b/.test(source)) {
      const allowed = new Set([
        path.join('apps', 'newframe', 'main', 'ipc', 'operations.ts'),
        path.join('apps', 'newframe', 'main', 'ipc', 'stateStream.ts')
      ])
      if (!allowed.has(file)) violations.push(`${file}: ipcMain.handle is restricted to typed IPC modules`)
    }

    if (productionMain(file) && /\bwebContents\.send\b/.test(source)) {
      const stateStream = path.join('apps', 'newframe', 'main', 'ipc', 'stateStream.ts')
      if (file !== stateStream) {
        violations.push(`${file}: webContents.send is restricted to the typed state stream`)
      }
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
  }

  for (const { file } of files) {
    if (!file.endsWith('.styl')) continue
    violations.push(`${file}: Stylus is forbidden; migrate the owning surface to the design system`)
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
