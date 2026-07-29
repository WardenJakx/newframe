import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import path from 'node:path'

export type ReleaseProduct = 'desktop' | 'extension'

export type ReleaseMetadata = {
  product: ReleaseProduct
  version: string
  tag: string
}

type PendingWrite = {
  path: string
  content: string
}

const MAX_COUNTER = 65_535

const productPaths: Record<
  ReleaseProduct,
  { package: string; manifest?: string; tagPrefix: string }
> = {
  desktop: {
    package: 'apps/newframe/package.json',
    tagPrefix: 'desktop'
  },
  extension: {
    package: 'apps/newframe-extension/package.json',
    manifest: 'apps/newframe-extension/src/manifest.json',
    tagPrefix: 'extension'
  }
}

function fail(message: string): never {
  throw new Error(message)
}

function canonicalNumber(value: string): boolean {
  return /^(0|[1-9]\d*)$/.test(value)
}

export function utcCalVerDate(date: Date): { year: string; datePart: string } {
  if (Number.isNaN(date.getTime())) {
    fail('Cannot prepare a release with an invalid date')
  }

  const year = String(date.getUTCFullYear())
  const month = String(date.getUTCMonth() + 1)
  const day = String(date.getUTCDate()).padStart(2, '0')
  return { year, datePart: String(Number(`${month}${day}`)) }
}

export function nextCalVer(product: ReleaseProduct, tags: readonly string[], date: Date): string {
  const { year, datePart } = utcCalVerDate(date)
  const prefix = productPaths[product].tagPrefix
  const tagPattern = new RegExp(
    `^${prefix}-v((?:0|[1-9]\\d*))\\.((?:0|[1-9]\\d*))\\.((?:0|[1-9]\\d*))$`
  )
  let currentCounter = 0

  for (const tag of tags) {
    const match = tagPattern.exec(tag)
    if (!match) {
      continue
    }

    const [, tagYear, tagDatePart, tagCounter] = match
    if (
      tagYear !== year ||
      tagDatePart !== datePart ||
      !canonicalNumber(tagCounter) ||
      Number(tagCounter) < 1 ||
      Number(tagCounter) > MAX_COUNTER
    ) {
      continue
    }
    currentCounter = Math.max(currentCounter, Number(tagCounter))
  }

  if (currentCounter === MAX_COUNTER) {
    fail(`Cannot prepare ${product} release: ${year}.${datePart} has reached counter ${MAX_COUNTER}`)
  }

  return `${year}.${datePart}.${currentCounter + 1}`
}

function replaceJsonVersion(content: string, version: string, filePath: string): string {
  let value: unknown
  try {
    value = JSON.parse(content)
  } catch (error) {
    fail(`Cannot read valid JSON from ${filePath}: ${String(error)}`)
  }

  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    typeof (value as Record<string, unknown>).version !== 'string'
  ) {
    fail(`${filePath} must contain a top-level string version`)
  }

  const versionProperty = /^(\s*"version"\s*:\s*)"[^"\r\n]*"/m
  if (!versionProperty.test(content)) {
    fail(`Cannot locate the top-level version in ${filePath}`)
  }
  return content.replace(versionProperty, `$1"${version}"`)
}

function writeTransaction(writes: readonly PendingWrite[]): void {
  const transactionId = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  const staged = writes.map((write) => ({
    ...write,
    temporaryPath: `${write.path}.release-${transactionId}.tmp`,
    backupPath: `${write.path}.release-${transactionId}.bak`,
    hadOriginal: existsSync(write.path)
  }))
  let committed = 0

  try {
    for (const write of staged) {
      mkdirSync(path.dirname(write.path), { recursive: true })
      writeFileSync(write.temporaryPath, write.content, { flag: 'wx' })
    }
    for (const write of staged) {
      if (write.hadOriginal) {
        renameSync(write.path, write.backupPath)
      }
      renameSync(write.temporaryPath, write.path)
      committed += 1
    }
  } catch (error) {
    for (let index = committed - 1; index >= 0; index -= 1) {
      const write = staged[index]
      rmSync(write.path, { force: true })
      if (write.hadOriginal && existsSync(write.backupPath)) {
        renameSync(write.backupPath, write.path)
      }
    }
    fail(`Could not update release files atomically: ${String(error)}`)
  } finally {
    for (const write of staged) {
      rmSync(write.temporaryPath, { force: true })
      if (existsSync(write.backupPath)) {
        if (!existsSync(write.path) && write.hadOriginal) {
          renameSync(write.backupPath, write.path)
        } else {
          rmSync(write.backupPath, { force: true })
        }
      }
    }
  }
}

export function releaseTagsFromRemoteOutput(
  product: ReleaseProduct,
  remoteOutput: string
): string[] {
  const prefix = productPaths[product].tagPrefix
  return [
    ...new Set(
      remoteOutput
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => {
      const ref = line.split(/\s+/)[1]
      const refPrefix = `refs/tags/${prefix}-v`
      if (!ref?.startsWith(refPrefix)) {
        fail(`Unexpected ${product} tag ref from origin: ${ref || line}`)
      }
      return ref.slice('refs/tags/'.length)
    })
    )
  ]
}

function listTags(root: string, product: ReleaseProduct): string[] {
  const prefix = productPaths[product].tagPrefix
  const remoteResult = Bun.spawnSync(
    ['git', 'ls-remote', '--tags', '--refs', 'origin', `refs/tags/${prefix}-v*`],
    {
      cwd: root,
      stdout: 'pipe',
      stderr: 'pipe'
    }
  )
  if (remoteResult.exitCode !== 0) {
    fail(`Could not list origin ${product} tags: ${remoteResult.stderr.toString().trim()}`)
  }

  return releaseTagsFromRemoteOutput(product, remoteResult.stdout.toString())
}

export function prepareRelease(
  root: string,
  product: ReleaseProduct,
  date: Date,
  tags: readonly string[]
): ReleaseMetadata {
  const config = productPaths[product]
  const version = nextCalVer(product, tags, date)
  const packagePath = path.join(root, config.package)
  const writes: PendingWrite[] = [
    {
      path: packagePath,
      content: replaceJsonVersion(readFileSync(packagePath, 'utf8'), version, packagePath)
    }
  ]

  if (config.manifest) {
    const manifestPath = path.join(root, config.manifest)
    writes.push({
      path: manifestPath,
      content: replaceJsonVersion(readFileSync(manifestPath, 'utf8'), version, manifestPath)
    })
  }

  writeTransaction(writes)

  return { product, version, tag: `${config.tagPrefix}-v${version}` }
}

export function writeGithubOutput(outputPath: string, metadata: ReleaseMetadata): void {
  appendFileSync(
    outputPath,
    `product=${metadata.product}\nversion=${metadata.version}\ntag=${metadata.tag}\n`
  )
}

type CliOptions = {
  product: ReleaseProduct
  githubOutput: string
}

export function parseCliOptions(args: readonly string[]): CliOptions {
  const [product, ...flags] = args
  if (product !== 'desktop' && product !== 'extension') {
    fail(
      'Usage: bun scripts/release/prepare-release.ts <desktop|extension> --github-output <path>'
    )
  }

  let githubOutput: string | undefined
  for (let index = 0; index < flags.length; index += 2) {
    const flag = flags[index]
    const value = flags[index + 1]
    if (!value) {
      fail(`Missing value for ${flag || 'workflow option'}`)
    }
    if (flag === '--github-output' && githubOutput === undefined) {
      githubOutput = value
    } else {
      fail(`Unknown or duplicate workflow option: ${flag}`)
    }
  }

  if (!githubOutput) {
    fail('Workflow preparation requires --github-output')
  }

  return { product, githubOutput }
}

if (import.meta.main) {
  const options = parseCliOptions(process.argv.slice(2))
  const root = path.resolve(import.meta.dir, '../..')
  const result = prepareRelease(root, options.product, new Date(), listTags(root, options.product))
  writeGithubOutput(path.resolve(options.githubOutput), result)
  console.log(JSON.stringify(result))
}
