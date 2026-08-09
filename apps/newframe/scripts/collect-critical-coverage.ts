import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const appRoot = path.resolve(import.meta.dirname, '..')
const outputRoot = path.join(appRoot, 'coverage', 'critical-parts')
const testFile = /\.(?:test|spec)\.[cm]?[jt]sx?$/
const riskTests = [
  /^src\/app\/contracts\//,
  /^src\/features\/transactions\/domain\//,
  /^src\/features\/accounts\/main\/(?:index|providerPort)\.test\./,
  /^src\/features\/agent-access\/main\/sessionStore\.test\./,
  /^src\/features\/access-control\/main\/authority\.test\./,
  /^src\/features\/transactions\/main\/(?:accountPolicyPort|sideTrayService)\.test\./,
  /^src\/platform\/persistence\//,
  /^src\/platform\/ipc\/main\//,
  /^src\/features\/requests\/main\/service\.test\./,
  /^src\/features\/(?:accounts|networks|tokens)\/main\/service\.test\./,
  /^src\/features\/accounts\/main\/accountOnboarding\//,
  /^src\/features\/connections\/main\/provider\/lifecycle\.test\./,
  /^src\/platform\/signing\/signatures\//,
  /^src\/platform\/state-store\/(?:persistence|actions)\.test\./,
  /^src\/features\/transactions\/main\//,
  /^src\/platform\/secrets\/vault\.test\./,
  /^src\/preload\//
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
  const preload = file.endsWith('.tsx')
    ? './test/support/dom.preload.ts'
    : file.includes('/main/') || file.startsWith('src/platform/')
      ? './test/support/electron.preload.ts'
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
