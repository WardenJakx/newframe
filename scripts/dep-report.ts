import { lstat, readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

type LockPackageMeta = {
  dependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
}

type LockWorkspace = {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
}

type BunLock = {
  workspaces?: Record<string, LockWorkspace>
  packages?: Record<string, [string, string, LockPackageMeta?]>
}

type PackageNode = {
  key: string
  name: string
  version: string
  id: string
  dependencies: Record<string, string>
}

type StorePackage = {
  name: string
  version: string
  id: string
  bytes: number
  variants: number
}

type DirectDependency = {
  workspace: string
  kind: 'dependencies' | 'devDependencies' | 'optionalDependencies'
  name: string
  range: string
  id: string
  transitiveCount: number
  approxBytes: number
}

type DuplicatePackage = {
  name: string
  versions: string[]
  bytes: number
}

type AuditReport = {
  root: string
  lockPackageCount: number
  storePackageCount: number
  storeVariantCount: number
  topRequiredStorePackages: StorePackage[]
  topStaleStorePackages: StorePackage[]
  topDirectByFanout: DirectDependency[]
  topDirectBySize: DirectDependency[]
  duplicatePackages: DuplicatePackage[]
}

const root = process.cwd()
const args = parseArgs(process.argv.slice(2))

if (args.help) {
  printHelp()
  process.exit(0)
}

const lock = await readBunLock(join(root, 'bun.lock'))
const { packageById, packagesByName } = buildPackageGraph(lock)
const storePackages = args.skipSize
  ? new Map<string, StorePackage>()
  : await readBunStore(join(root, 'node_modules', '.bun'))

const directDependencies = collectDirectDependencies(lock, packagesByName, storePackages)
const duplicatePackages = collectDuplicatePackages(packageById, storePackages)

const report: AuditReport = {
  root,
  lockPackageCount: packageById.size,
  storePackageCount: storePackages.size,
  storeVariantCount: sum([...storePackages.values()].map((pkg) => pkg.variants)),
  topRequiredStorePackages: top(
    [...storePackages.values()].filter((pkg) => packageById.has(pkg.id)),
    args.top,
    (pkg) => pkg.bytes
  ),
  topStaleStorePackages: top(
    [...storePackages.values()].filter((pkg) => !packageById.has(pkg.id)),
    args.top,
    (pkg) => pkg.bytes
  ),
  topDirectByFanout: top(
    directDependencies,
    args.top,
    (dep) => dep.transitiveCount * 1024 * 1024 * 1024 + dep.approxBytes
  ),
  topDirectBySize: args.skipSize ? [] : top(directDependencies, args.top, (dep) => dep.approxBytes),
  duplicatePackages: top(
    duplicatePackages,
    args.top,
    (pkg) => pkg.versions.length * 1024 * 1024 * 1024 + pkg.bytes
  )
}

if (args.json) {
  console.log(JSON.stringify(report, null, 2))
} else {
  printReport(report, args)
}

if (args.why.length > 0) {
  for (const name of args.why) {
    console.log('')
    console.log(`WHY ${name}`)
    const why = Bun.spawnSync(['bun', 'pm', 'why', name], {
      cwd: root,
      stdout: 'pipe',
      stderr: 'pipe'
    })

    const stdout = new TextDecoder().decode(why.stdout).trim()
    const stderr = new TextDecoder().decode(why.stderr).trim()
    if (stdout) console.log(stdout)
    if (stderr) console.error(stderr)
  }
}

function parseArgs(argv: string[]) {
  const parsed = {
    help: false,
    json: false,
    skipSize: false,
    top: 20,
    why: [] as string[]
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') parsed.help = true
    else if (arg === '--json') parsed.json = true
    else if (arg === '--no-size') parsed.skipSize = true
    else if (arg === '--top') {
      const value = argv[index + 1]
      index += 1
      parsed.top = parsePositiveInteger(value, '--top')
    } else if (arg === '--why') {
      const value = argv[index + 1]
      index += 1
      if (!value) throw new Error('--why requires a package name')
      parsed.why.push(value)
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return parsed
}

async function readBunLock(path: string): Promise<BunLock> {
  const text = await readFile(path, 'utf8')

  // bun.lock is JSON-like, but Bun writes trailing commas.
  return JSON.parse(text.replace(/,\s*([}\]])/g, '$1')) as BunLock
}

function buildPackageGraph(lock: BunLock) {
  const packageById = new Map<string, PackageNode>()
  const packagesByName = new Map<string, PackageNode[]>()

  for (const [key, tuple] of Object.entries(lock.packages ?? {})) {
    const { name, version, id } = splitPackageSpec(tuple[0])
    const meta = tuple[2] ?? {}
    const node: PackageNode = {
      key,
      name,
      version,
      id,
      dependencies: {
        ...(meta.dependencies ?? {}),
        ...(meta.optionalDependencies ?? {})
      }
    }

    if (!packageById.has(id)) packageById.set(id, node)
    const namedPackages = packagesByName.get(name) ?? []
    namedPackages.push(node)
    packagesByName.set(name, namedPackages)
  }

  return { packageById, packagesByName }
}

function collectDirectDependencies(
  lock: BunLock,
  packagesByName: Map<string, PackageNode[]>,
  storePackages: Map<string, StorePackage>
) {
  const directDependencies: DirectDependency[] = []
  const kinds = ['dependencies', 'devDependencies', 'optionalDependencies'] as const

  for (const [workspacePath, workspace] of Object.entries(lock.workspaces ?? {})) {
    for (const kind of kinds) {
      for (const [name, range] of Object.entries(workspace[kind] ?? {})) {
        const node = resolveDependency(packagesByName, name, range)
        if (!node) continue

        const transitive = collectTransitiveDependencies(node, packagesByName)
        const approxBytes =
          (storePackages.get(node.id)?.bytes ?? 0) +
          sum([...transitive].map((id) => storePackages.get(id)?.bytes ?? 0))

        directDependencies.push({
          workspace: workspacePath || '.',
          kind,
          name,
          range,
          id: node.id,
          transitiveCount: transitive.size,
          approxBytes
        })
      }
    }
  }

  return directDependencies
}

function collectTransitiveDependencies(node: PackageNode, packagesByName: Map<string, PackageNode[]>) {
  const seen = new Set<string>()
  const stack = [node]

  while (stack.length > 0) {
    const current = stack.pop()
    if (!current || seen.has(current.id)) continue

    seen.add(current.id)
    for (const [name, range] of Object.entries(current.dependencies)) {
      const next = resolveDependency(packagesByName, name, range)
      if (next && !seen.has(next.id)) stack.push(next)
    }
  }

  seen.delete(node.id)
  return seen
}

function collectDuplicatePackages(
  packageById: Map<string, PackageNode>,
  storePackages: Map<string, StorePackage>
): DuplicatePackage[] {
  const packagesByName = new Map<string, PackageNode[]>()
  for (const node of packageById.values()) {
    const namedPackages = packagesByName.get(node.name) ?? []
    namedPackages.push(node)
    packagesByName.set(node.name, namedPackages)
  }

  return [...packagesByName.entries()]
    .map(([name, nodes]) => {
      const versions = [...new Set(nodes.map((node) => node.version))].sort(compareVersions).reverse()
      return {
        name,
        versions,
        bytes: sum(nodes.map((node) => storePackages.get(node.id)?.bytes ?? 0))
      }
    })
    .filter((pkg) => pkg.versions.length > 1)
}

async function readBunStore(storeRoot: string) {
  const storePackages = new Map<string, StorePackage>()
  let entries

  try {
    entries = await readdir(storeRoot, { withFileTypes: true })
  } catch {
    return storePackages
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === 'node_modules') continue

    const parsed = parseStoreDirectoryName(entry.name)
    if (!parsed) continue

    const packageJsonPath = packageJsonPathForStorePackage(storeRoot, entry.name, parsed.name)
    const fromPackageJson = await readPackageIdentity(packageJsonPath)
    const identity = fromPackageJson ?? parsed
    const id = `${identity.name}@${identity.version}`
    const bytes = await directorySize(join(storeRoot, entry.name))
    const existing = storePackages.get(id) ?? {
      ...identity,
      id,
      bytes: 0,
      variants: 0
    }

    existing.bytes += bytes
    existing.variants += 1
    storePackages.set(id, existing)
  }

  return storePackages
}

async function readPackageIdentity(path: string) {
  try {
    const packageJson = JSON.parse(await readFile(path, 'utf8')) as {
      name?: string
      version?: string
    }

    if (packageJson.name && packageJson.version) {
      return {
        name: packageJson.name,
        version: packageJson.version
      }
    }
  } catch {
    return null
  }

  return null
}

async function directorySize(path: string): Promise<number> {
  let total = 0
  let entries

  try {
    entries = await readdir(path, { withFileTypes: true })
  } catch {
    return total
  }

  for (const entry of entries) {
    const childPath = join(path, entry.name)
    try {
      const stat = await lstat(childPath)
      if (stat.isDirectory()) total += await directorySize(childPath)
      else total += stat.size
    } catch {
      // Ignore packages disappearing during an install.
    }
  }

  return total
}

function splitPackageSpec(spec: string) {
  const versionSeparator = spec.lastIndexOf('@')
  return {
    name: spec.slice(0, versionSeparator),
    version: spec.slice(versionSeparator + 1),
    id: spec
  }
}

function parseStoreDirectoryName(directoryName: string) {
  const versionSeparator = directoryName.lastIndexOf('@')
  if (versionSeparator <= 0) return null

  const encodedName = directoryName.slice(0, versionSeparator)
  const versionAndPeerHash = directoryName.slice(versionSeparator + 1)
  const peerHashSeparator = versionAndPeerHash.indexOf('+')
  const version =
    peerHashSeparator === -1 ? versionAndPeerHash : versionAndPeerHash.slice(0, peerHashSeparator)
  const name = encodedName.startsWith('@') ? encodedName.replace('+', '/') : encodedName

  return {
    name,
    version,
    id: `${name}@${version}`
  }
}

function packageJsonPathForStorePackage(storeRoot: string, directoryName: string, name: string) {
  if (!name.startsWith('@')) {
    return join(storeRoot, directoryName, 'node_modules', name, 'package.json')
  }

  const [scope, packageName] = name.split('/')
  return join(storeRoot, directoryName, 'node_modules', scope, packageName, 'package.json')
}

function resolveDependency(packagesByName: Map<string, PackageNode[]>, name: string, range: string) {
  if (range.startsWith('workspace:')) return null

  const candidates = packagesByName.get(name) ?? []
  if (candidates.length === 0) return null

  const exact = candidates.find(
    (candidate) => candidate.version === range || candidate.id === `${name}@${range}`
  )
  if (exact) return exact

  const satisfying = candidates.filter((candidate) => satisfiesRange(candidate.version, range))
  const pool = satisfying.length > 0 ? satisfying : candidates

  return [...pool].sort((a, b) => compareVersions(a.version, b.version)).at(-1)
}

function satisfiesRange(version: string, range: string) {
  if (!range || range === '*' || range === 'latest') return true

  return range.split('||').some((rawPart) => {
    const part = rawPart.trim()
    if (!part) return false
    if (part.startsWith('^')) return satisfiesCaret(version, part.slice(1))
    if (part.startsWith('~')) return satisfiesTilde(version, part.slice(1))
    if (/^\d+(\.\d+)?(\.\d+)?$/.test(part)) return versionStartsWith(version, part)

    const comparator = part.match(/^(>=|>|<=|<)\s*(.+)$/)
    if (comparator) {
      const comparison = compareVersions(version, comparator[2])
      if (comparator[1] === '>=') return comparison >= 0
      if (comparator[1] === '>') return comparison > 0
      if (comparator[1] === '<=') return comparison <= 0
      return comparison < 0
    }

    return version === part
  })
}

function satisfiesCaret(version: string, base: string) {
  const baseParts = numericVersionParts(base)
  const versionParts = numericVersionParts(version)
  if (compareVersions(version, base) < 0) return false

  if (baseParts[0] > 0) return versionParts[0] === baseParts[0]
  if (baseParts[1] > 0) return versionParts[0] === 0 && versionParts[1] === baseParts[1]
  return versionParts[0] === 0 && versionParts[1] === 0 && versionParts[2] === baseParts[2]
}

function satisfiesTilde(version: string, base: string) {
  const baseParts = numericVersionParts(base)
  const versionParts = numericVersionParts(version)
  return (
    compareVersions(version, base) >= 0 &&
    versionParts[0] === baseParts[0] &&
    versionParts[1] === baseParts[1]
  )
}

function versionStartsWith(version: string, range: string) {
  const rangeParts = range.split('.')
  const versionParts = version.split('.')
  return rangeParts.every((part, index) => versionParts[index] === part)
}

function numericVersionParts(version: string) {
  return version
    .split(/[.-]/)
    .slice(0, 3)
    .map((part) => (/^\d+$/.test(part) ? Number(part) : 0))
    .concat([0, 0, 0])
    .slice(0, 3)
}

function compareVersions(a: string, b: string) {
  const aParts = a.split(/[^0-9A-Za-z]+/).filter(Boolean)
  const bParts = b.split(/[^0-9A-Za-z]+/).filter(Boolean)
  const length = Math.max(aParts.length, bParts.length)

  for (let index = 0; index < length; index += 1) {
    const aPart = aParts[index] ?? '0'
    const bPart = bParts[index] ?? '0'
    const aNumeric = /^\d+$/.test(aPart)
    const bNumeric = /^\d+$/.test(bPart)

    if (aNumeric && bNumeric && Number(aPart) !== Number(bPart)) {
      return Number(aPart) - Number(bPart)
    }

    if (aPart !== bPart) return aPart.localeCompare(bPart)
  }

  return 0
}

function top<T>(values: T[], limit: number, score: (value: T) => number) {
  return [...values].sort((a, b) => score(b) - score(a)).slice(0, limit)
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0)
}

function parsePositiveInteger(value: string | undefined, flag: string) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} requires a positive integer`)
  }

  return parsed
}

function formatSize(bytes: number) {
  if (bytes === 0) return 'n/a'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

function printReport(report: AuditReport, options: typeof args) {
  console.log('Dependency Audit Report')
  console.log(`Root: ${report.root}`)
  console.log(`Lockfile packages: ${report.lockPackageCount}`)
  if (options.skipSize) {
    console.log('Installed size scan: skipped')
  } else {
    console.log(`Bun store package IDs: ${report.storePackageCount}`)
    console.log(`Bun store variants: ${report.storeVariantCount}`)
  }

  console.log('')
  if (!options.skipSize) {
    printDirectDependencyTable('Direct Dependencies By Approx Transitive Store Size', report.topDirectBySize)
    console.log('')
  }
  printDirectDependencyTable('Direct Dependencies By Transitive Fanout', report.topDirectByFanout)

  if (!options.skipSize) {
    console.log('')
    printStoreTable('Largest Required Store Packages', report.topRequiredStorePackages)
    console.log('')
    printStoreTable('Largest Store Packages Not In Current Lockfile', report.topStaleStorePackages)
  }

  console.log('')
  printDuplicateTable('Duplicate Package Versions In Lockfile', report.duplicatePackages)

  console.log('')
  console.log('Notes:')
  console.log(
    '- Counts and transitive sizes are lockfile-derived approximations; use `bun pm why <pkg>` for exact ancestry.'
  )
  console.log('- Stale store packages occupy disk but are not required by the current lockfile.')
  console.log('- Run from a clean install for the most accurate disk-size report.')
}

function printDirectDependencyTable(title: string, dependencies: DirectDependency[]) {
  console.log(title)
  console.log('size       deps  workspace             kind                  package')
  for (const dep of dependencies) {
    console.log(
      `${formatSize(dep.approxBytes).padStart(9)}  ${String(dep.transitiveCount).padStart(4)}  ${dep.workspace.padEnd(21)} ${dep.kind.padEnd(21)} ${dep.name} -> ${dep.id}`
    )
  }
}

function printStoreTable(title: string, packages: StorePackage[]) {
  console.log(title)
  console.log('size       variants  package')
  for (const pkg of packages) {
    console.log(`${formatSize(pkg.bytes).padStart(9)}  ${String(pkg.variants).padStart(8)}  ${pkg.id}`)
  }
}

function printDuplicateTable(title: string, packages: DuplicatePackage[]) {
  console.log(title)
  console.log('size       versions  package')
  for (const pkg of packages) {
    console.log(
      `${formatSize(pkg.bytes).padStart(9)}  ${String(pkg.versions.length).padStart(8)}  ${pkg.name}: ${pkg.versions.join(', ')}`
    )
  }
}

function printHelp() {
  console.log(`Usage: bun run dep:report [options]

Options:
  --top <n>       Number of rows per section. Defaults to 20.
  --why <pkg>     Also run 'bun pm why <pkg>'. May be repeated.
  --json          Print machine-readable JSON.
  --no-size       Skip node_modules/.bun disk-size scanning.
  -h, --help      Show this help.
`)
}
