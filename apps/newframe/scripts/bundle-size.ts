import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import path from 'path'
import { gzipSync } from 'zlib'

type SizeGroup = {
  bytes: number
  files: number
  gzipBytes?: number
}

type BundleReport = {
  activeRuntime: SizeGroup
  activeWithSourceMaps: SizeGroup
  all: SizeGroup
  byExtension: Record<string, SizeGroup>
  entrypoints: string[]
  largestActiveRuntimeFiles: { bytes: number; name: string }[]
  staleOrUnreferenced: SizeGroup
}

const bundleDir = path.resolve(process.cwd(), 'bundle')
const packageJsonPath = path.resolve(process.cwd(), 'package.json')
const entrypointFields = ['bridge', 'tray', 'dash', 'dapp', 'notify']
const outputAsJson = process.argv.includes('--json')

function bytes(files: string[]) {
  return files.reduce((total, file) => total + statSync(path.join(bundleDir, file)).size, 0)
}

function gzipBytes(files: string[]) {
  return files.reduce((total, file) => total + gzipSync(readFileSync(path.join(bundleDir, file))).length, 0)
}

function formatBytes(size: number) {
  const units = ['B', 'KB', 'MB', 'GB']
  let value = size
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  const decimals = value >= 10 || unitIndex === 0 ? 0 : 1

  return `${value.toFixed(decimals)} ${units[unitIndex]}`
}

function printGroup(label: string, group: SizeGroup) {
  const gzip = group.gzipBytes === undefined ? '' : ` / ${formatBytes(group.gzipBytes)} gzip`
  console.log(`${label}: ${formatBytes(group.bytes)}${gzip} (${group.files} files)`)
}

function readEntrypoints() {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as Record<string, unknown>

  return entrypointFields
    .map((field) => packageJson[field])
    .filter((value): value is string => typeof value === 'string')
    .map((value) => path.basename(value))
}

function traceActiveFiles(files: string[], entrypoints: string[]) {
  const fileSet = new Set(files)
  const candidates = [...files].sort((a, b) => b.length - a.length)
  const active = new Set<string>()
  const queue = entrypoints.filter((entrypoint) => fileSet.has(entrypoint))

  while (queue.length > 0) {
    const file = queue.shift()
    if (!file || active.has(file)) continue

    active.add(file)

    let contents = ''
    try {
      contents = readFileSync(path.join(bundleDir, file), 'utf8')
    } catch {
      continue
    }

    for (const candidate of candidates) {
      if (!active.has(candidate) && contents.includes(candidate)) queue.push(candidate)
    }
  }

  return [...active].sort()
}

function byExtension(files: string[]) {
  return files.reduce<Record<string, SizeGroup>>((groups, file) => {
    const extension = path.extname(file) || '[none]'
    const group = groups[extension] || { bytes: 0, files: 0 }

    group.bytes += statSync(path.join(bundleDir, file)).size
    group.files += 1
    groups[extension] = group

    return groups
  }, {})
}

function buildReport(): BundleReport {
  if (!existsSync(bundleDir)) {
    throw new Error(`Bundle output not found: ${bundleDir}. Run bun run bundle first.`)
  }

  const files = readdirSync(bundleDir)
    .filter((file) => statSync(path.join(bundleDir, file)).isFile())
    .sort()
  const entrypoints = readEntrypoints()
  const activeFiles = traceActiveFiles(files, entrypoints)
  const activeRuntimeFiles = activeFiles.filter((file) => !file.endsWith('.map'))
  const activeSet = new Set(activeFiles)
  const staleFiles = files.filter((file) => !activeSet.has(file))

  const largestActiveRuntimeFiles = activeRuntimeFiles
    .map((name) => ({ bytes: statSync(path.join(bundleDir, name)).size, name }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 20)

  return {
    activeRuntime: {
      bytes: bytes(activeRuntimeFiles),
      files: activeRuntimeFiles.length,
      gzipBytes: gzipBytes(activeRuntimeFiles)
    },
    activeWithSourceMaps: {
      bytes: bytes(activeFiles),
      files: activeFiles.length,
      gzipBytes: gzipBytes(activeFiles)
    },
    all: {
      bytes: bytes(files),
      files: files.length
    },
    byExtension: byExtension(files),
    entrypoints,
    largestActiveRuntimeFiles,
    staleOrUnreferenced: {
      bytes: bytes(staleFiles),
      files: staleFiles.length
    }
  }
}

const report = buildReport()

if (outputAsJson) {
  console.log(JSON.stringify(report, null, 2))
} else {
  printGroup('Bundle directory', report.all)
  printGroup('Active runtime', report.activeRuntime)
  printGroup('Active with source maps', report.activeWithSourceMaps)
  printGroup('Stale or unreferenced', report.staleOrUnreferenced)

  console.log('\nBy extension')
  for (const [extension, group] of Object.entries(report.byExtension).sort(
    (a, b) => b[1].bytes - a[1].bytes
  )) {
    console.log(`${extension.padStart(7)}  ${formatBytes(group.bytes).padStart(8)}  ${group.files} files`)
  }

  console.log('\nLargest active runtime files')
  for (const file of report.largestActiveRuntimeFiles) {
    console.log(`${formatBytes(file.bytes).padStart(8)}  ${file.name}`)
  }
}
