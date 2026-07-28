import { createHash } from 'node:crypto'
import {
  appendFileSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

type JsonObject = Record<string, unknown>

type ReleaseMetadata = {
  version: string
  tag: string
  artifact: string
  checksum: string
}

const extensionRoot = path.resolve(import.meta.dir, '..')
const packagePath = path.join(extensionRoot, 'package.json')
const sourceManifestPath = path.join(extensionRoot, 'src/manifest.json')
const distPath = path.join(extensionRoot, 'dist')

function fail(message: string): never {
  throw new Error(message)
}

function readJson(filePath: string): JsonObject {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as JsonObject
  } catch (error) {
    fail(`Cannot read valid JSON from ${filePath}: ${String(error)}`)
  }
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    fail(`${label} must be a non-empty string`)
  }
  return value
}

function requireObject(value: unknown, label: string): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(`${label} must be an object`)
  }
  return value as JsonObject
}

function requireStringArray(value: unknown, label: string): string[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((item) => typeof item !== 'string' || item.length === 0)
  ) {
    fail(`${label} must be a non-empty array of strings`)
  }
  return value as string[]
}

function validateSource(): ReleaseMetadata {
  const packageJson = readJson(packagePath)
  const manifest = readJson(sourceManifestPath)
  const packageVersion = requireString(packageJson.version, 'package.json version')
  const manifestVersion = requireString(manifest.version, 'manifest.json version')

  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(packageVersion)) {
    fail(`Extension version must be a three-part numeric version, got "${packageVersion}"`)
  }
  if (packageVersion.split('.').some((component) => Number(component) > 65_535)) {
    fail(`Extension version components must be between 0 and 65535, got "${packageVersion}"`)
  }
  if (manifestVersion !== packageVersion) {
    fail(
      `Extension package and manifest versions are not synchronized: ${packageVersion} != ${manifestVersion}`
    )
  }

  return {
    version: packageVersion,
    tag: `extension-v${packageVersion}`,
    artifact: `Newframe-Browser-Extension-${packageVersion}.zip`,
    checksum: `Newframe-Browser-Extension-${packageVersion}.zip.sha256`
  }
}

function safeRelativeFile(file: string, label: string): string {
  if (
    file.length === 0 ||
    path.posix.isAbsolute(file) ||
    file.includes('\\') ||
    file.split('/').includes('..')
  ) {
    fail(`${label} contains an unsafe path: "${file}"`)
  }
  return file
}

function referencedFiles(manifest: JsonObject): Set<string> {
  const files = new Set<string>()
  const add = (value: unknown, label: string) =>
    files.add(safeRelativeFile(requireString(value, label), label))
  const addMany = (value: unknown, label: string) => {
    for (const file of requireStringArray(value, label)) {
      files.add(safeRelativeFile(file, label))
    }
  }

  const background = requireObject(manifest.background, 'manifest background')
  add(background.service_worker, 'manifest background.service_worker')
  addMany(background.scripts, 'manifest background.scripts')

  const contentScripts = manifest.content_scripts
  if (!Array.isArray(contentScripts) || contentScripts.length === 0) {
    fail('manifest content_scripts must be a non-empty array')
  }
  for (const [index, entry] of contentScripts.entries()) {
    const contentScript = requireObject(entry, `manifest content_scripts[${index}]`)
    addMany(contentScript.js, `manifest content_scripts[${index}].js`)
    if (contentScript.css !== undefined) {
      addMany(contentScript.css, `manifest content_scripts[${index}].css`)
    }
  }

  const resources = manifest.web_accessible_resources
  if (!Array.isArray(resources) || resources.length === 0) {
    fail('manifest web_accessible_resources must be a non-empty array')
  }
  for (const [index, entry] of resources.entries()) {
    const resource = requireObject(entry, `manifest web_accessible_resources[${index}]`)
    addMany(resource.resources, `manifest web_accessible_resources[${index}].resources`)
  }

  for (const [size, icon] of Object.entries(requireObject(manifest.icons, 'manifest icons'))) {
    add(icon, `manifest icons.${size}`)
  }

  const action = requireObject(manifest.action, 'manifest action')
  if (action.default_popup !== undefined) {
    add(action.default_popup, 'manifest action.default_popup')
  }
  for (const [size, icon] of Object.entries(
    requireObject(action.default_icon, 'manifest action.default_icon')
  )) {
    add(icon, `manifest action.default_icon.${size}`)
  }

  return files
}

function validateBrowserStructure(root: string, expectedVersion: string): void {
  const manifestFile = path.join(root, 'manifest.json')
  if (!existsSync(manifestFile)) {
    fail('The package must contain manifest.json at its root')
  }

  const manifest = readJson(manifestFile)
  if (manifest.version !== expectedVersion) {
    fail(`Packaged manifest version ${String(manifest.version)} does not match ${expectedVersion}`)
  }
  if (manifest.manifest_version !== 3) {
    fail('The packaged extension must use Manifest V3')
  }

  const minimumChromeVersionValue = requireString(
    manifest.minimum_chrome_version,
    'manifest minimum_chrome_version'
  )
  if (
    !/^(0|[1-9]\d*)$/.test(minimumChromeVersionValue) ||
    Number(minimumChromeVersionValue) < 121 ||
    Number(minimumChromeVersionValue) > 65_535
  ) {
    fail('minimum_chrome_version must be at least 121 when background.scripts and service_worker coexist')
  }

  const background = requireObject(manifest.background, 'manifest background')
  const serviceWorker = requireString(background.service_worker, 'manifest background.service_worker')
  const firefoxScripts = requireStringArray(background.scripts, 'manifest background.scripts')
  if (!firefoxScripts.includes(serviceWorker)) {
    fail('Firefox background.scripts must include the Chromium service worker file')
  }

  const browserSettings = requireObject(
    manifest.browser_specific_settings,
    'manifest browser_specific_settings'
  )
  const gecko = requireObject(browserSettings.gecko, 'manifest browser_specific_settings.gecko')
  requireString(gecko.id, 'manifest browser_specific_settings.gecko.id')

  for (const file of referencedFiles(manifest)) {
    const resolved = path.join(root, file)
    if (!existsSync(resolved) || !lstatSync(resolved).isFile()) {
      fail(`Manifest references a missing package file: ${file}`)
    }
  }
}

function listFiles(root: string, relative = ''): string[] {
  const files: string[] = []
  for (const name of readdirSync(path.join(root, relative)).sort()) {
    const file = path.posix.join(relative, name)
    const absolute = path.join(root, file)
    const stat = lstatSync(absolute)
    if (stat.isSymbolicLink()) {
      fail(`Extension packages may not contain symbolic links: ${file}`)
    }
    if (stat.isDirectory()) {
      files.push(...listFiles(root, file))
    } else if (stat.isFile()) {
      files.push(file)
    } else {
      fail(`Extension packages may contain only regular files and directories: ${file}`)
    }
  }
  return files
}

async function run(command: string[], cwd?: string): Promise<string> {
  const process = Bun.spawn(command, {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe'
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text()
  ])
  if (exitCode !== 0) {
    fail(`${command.join(' ')} failed:\n${stderr || stdout}`)
  }
  return stdout
}

function sha256(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex')
}

function option(name: string, required = true): string | undefined {
  const index = process.argv.indexOf(name)
  const value = index === -1 ? undefined : process.argv[index + 1]
  if (required && (!value || value.startsWith('--'))) {
    fail(`Missing required ${name} option`)
  }
  return value
}

function writeGitHubOutput(metadata: ReleaseMetadata): void {
  const outputPath = option('--github-output', false)
  if (!outputPath) return
  appendFileSync(
    outputPath,
    [
      `version=${metadata.version}`,
      `tag=${metadata.tag}`,
      `artifact=${metadata.artifact}`,
      `checksum=${metadata.checksum}`
    ].join('\n') + '\n'
  )
}

async function packageExtension(): Promise<void> {
  const metadata = validateSource()
  const outputDir = path.resolve(option('--output-dir')!)
  if (!existsSync(distPath)) {
    fail(`Missing extension build output: ${distPath}`)
  }
  validateBrowserStructure(distPath, metadata.version)

  mkdirSync(outputDir, { recursive: true })
  const artifactPath = path.join(outputDir, metadata.artifact)
  const checksumPath = path.join(outputDir, metadata.checksum)
  if (existsSync(artifactPath) || existsSync(checksumPath)) {
    fail(`Refusing to overwrite an existing release artifact in ${outputDir}`)
  }

  const files = listFiles(distPath)
  if (files.length === 0) fail('Extension build output is empty')
  await run(['zip', '-X', '-q', artifactPath, ...files], distPath)
  const digest = sha256(artifactPath)
  writeFileSync(checksumPath, `${digest}  ${metadata.artifact}\n`)
  await verifyPackage(artifactPath, checksumPath, metadata)
  console.log(`Created ${artifactPath}`)
  console.log(`Created ${checksumPath}`)
}

async function verifyPackage(
  artifactPath = path.resolve(option('--artifact')!),
  checksumPath = path.resolve(option('--checksum')!),
  metadata = validateSource()
): Promise<void> {
  if (path.basename(artifactPath) !== metadata.artifact) {
    fail(`Artifact must be named ${metadata.artifact}`)
  }
  if (path.basename(checksumPath) !== metadata.checksum) {
    fail(`Checksum must be named ${metadata.checksum}`)
  }

  const checksumLine = readFileSync(checksumPath, 'utf8').trim()
  const expectedLine = `${sha256(artifactPath)}  ${metadata.artifact}`
  if (checksumLine !== expectedLine) {
    fail(`Checksum content does not match ${metadata.artifact}`)
  }

  const entries = (await run(['unzip', '-Z1', artifactPath])).split(/\r?\n/).filter(Boolean)
  if (entries.filter((entry) => entry === 'manifest.json').length !== 1) {
    fail('Archive must contain exactly one manifest.json at its root')
  }
  for (const entry of entries) safeRelativeFile(entry.replace(/\/$/, ''), 'archive')

  const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'newframe-extension-release-'))
  try {
    await run(['unzip', '-q', artifactPath, '-d', temporaryRoot])
    validateBrowserStructure(temporaryRoot, metadata.version)
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
  console.log(`Verified ${metadata.artifact} (${metadata.version})`)
}

async function main(): Promise<void> {
  const command = process.argv[2]
  if (command === 'validate-source') {
    const metadata = validateSource()
    writeGitHubOutput(metadata)
    console.log(`Validated extension release metadata ${metadata.version}`)
  } else if (command === 'package') {
    await packageExtension()
  } else if (command === 'verify') {
    await verifyPackage()
  } else {
    fail('Usage: release-extension.ts <validate-source|package|verify> [options]')
  }
}

await main()
