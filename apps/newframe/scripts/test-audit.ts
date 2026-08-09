import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

type FileAudit = {
  assertions: number
  callbackTests: number
  category: string
  mockCallAssertions: number
  mockModules: number
  mocks: number
  path: string
  tests: number
}

const appRoot = path.resolve(import.meta.dirname, '..')
const json = process.argv.includes('--json')
const check = process.argv.includes('--check')
const baselineArgument = process.argv.find((value) => value.startsWith('--baseline='))
const baselinePath = path.resolve(
  appRoot,
  baselineArgument?.slice('--baseline='.length) || 'test/test-audit-baseline.json'
)
const ignoredDirectories = new Set([
  'bundle',
  'compiled',
  'coverage',
  'dist',
  'generated',
  'node_modules',
  'styled-system'
])
const testFile = /\.(?:test|spec)\.[cm]?[jt]sx?$/

function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    if (ignoredDirectories.has(entry)) return []
    const absolute = path.join(directory, entry)
    return statSync(absolute).isDirectory() ? walk(absolute) : [absolute]
  })
}

function count(source: string, expression: RegExp) {
  return source.match(expression)?.length || 0
}

function category(relativePath: string) {
  const root = relativePath.split('/')[0]
  if (relativePath.startsWith('src/preload/')) return 'preload'
  if (relativePath.startsWith('test/extension/')) return 'renderer'
  if (relativePath.includes('/renderer/')) return 'renderer'
  if (relativePath.startsWith('src/app/contracts/') || relativePath.includes('/contract/')) return 'contracts'
  if (relativePath.includes('/domain/') || relativePath.startsWith('src/shared/domain/')) return 'domain'
  if (root === 'src') return 'main'
  if (root === 'scripts') return 'scripts'
  if (root === 'test') return 'test-support'
  return root
}

function auditFile(absolutePath: string): FileAudit {
  const source = readFileSync(absolutePath, 'utf8')
  const relativePath = path.relative(appRoot, absolutePath).split(path.sep).join('/')

  return {
    assertions: count(source, /\b(?:assert(?:Equals?|NotEquals?|StrictEquals?)?|expect)\s*\(/g),
    callbackTests: count(
      source,
      /^\s*(?:it|test)(?:\.(?:each|only|skip|todo))?\s*\([^,\n]+,\s*(?:async\s*)?\(\s*done\b/gm
    ),
    category: category(relativePath),
    mockCallAssertions: count(source, /\.(?:not\.)?toHaveBeenCalled(?:Times|With)?\s*\(/g),
    mockModules: count(source, /\bmock\.module\s*\(/g),
    mocks: count(source, /\b(?:mock|spyOn)\s*\(/g),
    path: relativePath,
    tests: count(source, /^\s*(?:it|test)(?:\.(?:each|only|skip|todo))?\s*\(/gm)
  }
}

const files = walk(appRoot)
  .filter((file) => testFile.test(file))
  .map(auditFile)
const byCategory = [...new Set(files.map((file) => file.category))].sort().map((name) => {
  const categoryFiles = files.filter((file) => file.category === name)
  return {
    assertions: categoryFiles.reduce((sum, file) => sum + file.assertions, 0),
    callbackTests: categoryFiles.reduce((sum, file) => sum + file.callbackTests, 0),
    files: categoryFiles.length,
    mockCallAssertions: categoryFiles.reduce((sum, file) => sum + file.mockCallAssertions, 0),
    mockModules: categoryFiles.reduce((sum, file) => sum + file.mockModules, 0),
    mocks: categoryFiles.reduce((sum, file) => sum + file.mocks, 0),
    name,
    tests: categoryFiles.reduce((sum, file) => sum + file.tests, 0)
  }
})

const suspicious = files.filter((file) => file.tests > 0 && file.assertions === 0).map((file) => file.path)
const misplacedScenarios = files
  .filter((file) => /(?:^|\/)test\/e2e\//.test(file.path))
  .map((file) => file.path)
const totals = {
  assertions: files.reduce((sum, file) => sum + file.assertions, 0),
  callbackTests: files.reduce((sum, file) => sum + file.callbackTests, 0),
  files: files.length,
  mockCallAssertions: files.reduce((sum, file) => sum + file.mockCallAssertions, 0),
  mockModules: files.reduce((sum, file) => sum + file.mockModules, 0),
  mocks: files.reduce((sum, file) => sum + file.mocks, 0),
  tests: files.reduce((sum, file) => sum + file.tests, 0)
}
const report = {
  categories: byCategory,
  generatedAt: new Date().toISOString(),
  misplacedScenarios,
  suspiciousNoAssertionFiles: suspicious,
  totals
}

if (json) {
  console.log(JSON.stringify(report, null, 2))
} else {
  console.log('Newframe static test audit')
  console.table(byCategory)
  console.log(
    `Totals: ${totals.files} files, ${totals.tests} declared tests, ${totals.assertions} assertions`
  )
  console.log(
    `Test doubles: ${totals.mocks} mocks/spies, ${totals.mockModules} module mocks, ` +
      `${totals.mockCallAssertions} mock-call assertions`
  )
  console.log(`Callback-style tests: ${totals.callbackTests}`)
  if (suspicious.length > 0) {
    console.log(`Files with declared tests and no static assertion calls:\n${suspicious.join('\n')}`)
  }
  if (misplacedScenarios.length > 0) {
    console.error(`Operator scenarios still named as e2e tests:\n${misplacedScenarios.join('\n')}`)
  }
}

if (check && misplacedScenarios.length > 0) process.exitCode = 1

if (check) {
  type AuditBaseline = {
    maximum: {
      callbackTests: number
      misplacedScenarioFiles: number
      mockCallAssertions: number
      moduleMocks: number
      noAssertionFiles: number
    }
  }

  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')) as AuditBaseline
  const measurements = {
    callbackTests: totals.callbackTests,
    misplacedScenarioFiles: misplacedScenarios.length,
    mockCallAssertions: totals.mockCallAssertions,
    moduleMocks: totals.mockModules,
    noAssertionFiles: suspicious.length
  }
  const regressions = Object.entries(measurements).flatMap(([name, actual]) => {
    const maximum = baseline.maximum[name as keyof typeof baseline.maximum]
    return actual > maximum ? [`${name}: ${actual} exceeds ratchet maximum ${maximum}`] : []
  })

  if (regressions.length > 0) {
    console.error(`Test audit ratchets failed:\n- ${regressions.join('\n- ')}`)
    process.exitCode = 1
  } else if (!json) {
    console.log(`Test audit ratchets passed (${path.relative(appRoot, baselinePath)}).`)
  }
}
