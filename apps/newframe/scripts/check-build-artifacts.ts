import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const appRoot = path.resolve(import.meta.dirname, '..')
const compiledRoot = path.join(appRoot, 'compiled')
const bundleRoot = path.join(appRoot, 'bundle')
const testArtifact =
  /(?:^|\/)(?:__mocks__|__tests__)(?:\/|$)|(?:^|\/)[^/]+\.(?:test|spec|test-support|test-fixture)\./
const esmStatement = /^\s*(?:import(?:\s|\{|\*|["'])|export(?:\s|\{|\*))/m
const typescriptCommonJs =
  /\b(?:__createBinding|__setModuleDefault|__importStar|__importDefault|__exportStar)\b|Object\.defineProperty\(\s*exports\s*,\s*["']__esModule["']|(?:^|\n)\s*(?:module\.exports|exports(?:\.|\[))|\brequire\s*\(/
const workerEntrypoints = [
  'main/externalData/balances/worker.js',
  'main/signers/hot/HotSigner/worker.js',
  'main/signers/hot/RingSigner/worker.js',
  'main/signers/hot/SeedSigner/worker.js'
]

type PackageMetadata = {
  bridge?: string
  main?: string
  type?: string
}

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const target = path.join(directory, entry)
    return statSync(target).isDirectory() ? walk(target) : [target]
  })
}

function readPackageMetadata(): PackageMetadata {
  return JSON.parse(readFileSync(path.join(appRoot, 'package.json'), 'utf8')) as PackageMetadata
}

function assertEsmEntrypoint(file: string, label: string) {
  if (!existsSync(file)) fail(`${label} does not exist: ${path.relative(appRoot, file)}`)

  const source = readFileSync(file, 'utf8')
  if (!esmStatement.test(source)) {
    fail(`${label} does not contain an ESM import or export: ${path.relative(appRoot, file)}`)
  }
  if (typescriptCommonJs.test(source)) {
    fail(`${label} contains CommonJS output: ${path.relative(appRoot, file)}`)
  }
}

function assertCompiledEsm() {
  const metadata = readPackageMetadata()
  if (metadata.type !== 'module') fail('package.json must declare "type": "module" for compiled ESM')
  if (metadata.main !== 'compiled/main/bootstrap.js') {
    fail('package.json main must point to compiled/main/bootstrap.js')
  }

  const mainEntrypoint = path.resolve(appRoot, metadata.main)
  if (!mainEntrypoint.startsWith(`${compiledRoot}${path.sep}`)) {
    fail(`package.json main must be inside compiled/: ${metadata.main}`)
  }
  assertEsmEntrypoint(mainEntrypoint, 'Electron main entrypoint')

  const compiledMetadata = JSON.parse(
    readFileSync(path.join(compiledRoot, 'package.json'), 'utf8')
  ) as PackageMetadata
  if (compiledMetadata.type !== 'module') {
    fail('compiled/package.json must retain "type": "module" for the emitted module scope')
  }

  for (const worker of workerEntrypoints) {
    assertEsmEntrypoint(path.join(compiledRoot, worker), 'Worker entrypoint')
  }

  for (const file of walk(compiledRoot).filter((candidate) => candidate.endsWith('.js'))) {
    if (typescriptCommonJs.test(readFileSync(file, 'utf8'))) {
      fail(`Compiled artifact contains TypeScript CommonJS output: ${path.relative(appRoot, file)}`)
    }
  }
}

function assertBundlePreloadBoundary() {
  const metadata = readPackageMetadata()
  const bridge = path.join(bundleRoot, 'bridge.cjs')
  const legacyBridge = path.join(bundleRoot, 'bridge.js')

  if (metadata.bridge !== './bundle/bridge.cjs') {
    fail('package.json bridge must point to ./bundle/bridge.cjs')
  }
  if (!existsSync(bridge)) fail('Bundled preload does not exist: bundle/bridge.cjs')
  if (existsSync(legacyBridge)) fail('Legacy preload must not be emitted: bundle/bridge.js')
}

const requestedRoots = process.argv.slice(2)

if (requestedRoots.length === 0) {
  console.error('Provide at least one build output directory to inspect')
  process.exit(1)
}

const resolvedRoots = requestedRoots.map((root) => path.resolve(appRoot, root))
if (resolvedRoots.includes(compiledRoot)) assertCompiledEsm()
if (resolvedRoots.includes(bundleRoot)) assertBundlePreloadBoundary()

const artifacts = requestedRoots.flatMap((root) => {
  const outputRoot = path.resolve(appRoot, root)

  if (!existsSync(outputRoot)) {
    console.error(`Build output does not exist: ${path.relative(appRoot, outputRoot)}`)
    process.exit(1)
  }

  return walk(outputRoot)
    .map((file) => path.relative(appRoot, file).split(path.sep).join('/'))
    .filter((file) => testArtifact.test(file))
})

if (artifacts.length > 0) {
  console.error(
    `Test-only files were emitted into build output:\n${artifacts.map((file) => `- ${file}`).join('\n')}`
  )
  process.exit(1)
}
