import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const appRoot = path.resolve(import.meta.dirname, '..')
const outputRoot = path.join(appRoot, 'coverage', 'critical-parts')
const testFile = /\.(?:test|spec)\.[cm]?[jt]sx?$/
const riskTests = [
  /^contracts\//,
  /^domain\/transaction\//,
  /^main\/accounts\/index\.test\./,
  /^main\/agent\/sessionStore\.test\./,
  /^main\/accounts\/providerPort\.test\./,
  /^main\/authority\.test\./,
  /^main\/features\/transactions\/accountPolicyPort\.test\./,
  /^main\/infrastructure\/persistence\//,
  /^main\/ipc\//,
  /^main\/operations\/sideTrayTransactions\.test\./,
  /^main\/operations\/walletWorkflows\.test\./,
  /^main\/provider\/accountRequestPort\.test\./,
  /^main\/provider\/lifecycle\.test\./,
  /^main\/signatures\//,
  /^main\/store\/persistence\.test\./,
  /^main\/store\/actions\.test\./,
  /^main\/transaction\//,
  /^main\/vault\.test\./,
  /^preload\//
]

function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    if (['bundle', 'compiled', 'coverage', 'generated', 'node_modules', 'styled-system'].includes(entry)) {
      return []
    }
    const absolute = path.join(directory, entry)
    return statSync(absolute).isDirectory() ? walk(absolute) : [absolute]
  })
}

function relative(absolute: string) {
  return path.relative(appRoot, absolute).split(path.sep).join('/')
}

const tests = walk(appRoot)
  .filter((file) => testFile.test(file))
  .map(relative)
  .filter((file) => riskTests.some((pattern) => pattern.test(file)))
  .sort()

if (tests.length === 0) {
  console.error('No critical-risk tests were discovered.')
  process.exit(1)
}

rmSync(outputRoot, { force: true, recursive: true })
mkdirSync(outputRoot, { recursive: true })

const failures: string[] = []
for (const [index, file] of tests.entries()) {
  const coverageDir = path.join(outputRoot, String(index).padStart(3, '0'))
  const preload =
    file.endsWith('.tsx') || file.startsWith('renderer/')
      ? './test/support/bun.dom.ts'
      : file.startsWith('main/')
        ? './test/support/bun.setup.ts'
        : undefined
  const command = [
    'bun',
    'test',
    ...(preload ? ['--preload', preload] : []),
    '--timeout',
    '5000',
    '--coverage',
    '--coverage-reporter=lcov',
    `--coverage-dir=${coverageDir}`,
    `./${file}`
  ]
  console.log(`[critical-coverage] ${file}`)
  const child = Bun.spawn(command, { cwd: appRoot, stderr: 'inherit', stdout: 'inherit' })
  if ((await child.exited) !== 0) failures.push(file)
}

if (failures.length > 0) {
  console.error(`Critical coverage tests failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}

const gate = Bun.spawn(['bun', './scripts/check-critical-coverage.ts', './coverage/critical-parts'], {
  cwd: appRoot,
  stderr: 'inherit',
  stdout: 'inherit'
})
process.exitCode = await gate.exited
