import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

type Metric = { hit: number; total: number }
type Coverage = { branches: Metric; functions: Metric; lines: Metric }
type RawCoverage = {
  branches: Map<string, number>
  functionHits: number
  functionTotal: number
  functions: Map<string, number>
  lines: Map<string, number>
}
type Rule = {
  minimum: { branches?: number; functions?: number; lines: number }
  name: string
  patterns: string[]
  rationale: string
}

const appRoot = path.resolve(import.meta.dirname, '..')
const reportOnly = process.argv.includes('--report-only')
const positional = process.argv.slice(2).filter((value) => !value.startsWith('--'))
const lcovPath = path.resolve(appRoot, positional[0] || 'coverage/lcov.info')
const manifestPath = path.resolve(appRoot, positional[1] || 'test/critical-coverage.json')

function emptyCoverage(): Coverage {
  return {
    branches: { hit: 0, total: 0 },
    functions: { hit: 0, total: 0 },
    lines: { hit: 0, total: 0 }
  }
}

function add(target: Coverage, source: Coverage) {
  for (const metric of ['branches', 'functions', 'lines'] as const) {
    target[metric].hit += source[metric].hit
    target[metric].total += source[metric].total
  }
}

function percentage(metric: Metric) {
  return metric.total === 0 ? 0 : (metric.hit / metric.total) * 100
}

function glob(pattern: string) {
  let expression = '^'
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index]
    const next = pattern[index + 1]
    if (character === '*' && next === '*') {
      if (pattern[index + 2] === '/') {
        expression += '(?:.*/)?'
        index += 2
      } else {
        expression += '.*'
        index += 1
      }
    } else if (character === '*') {
      expression += '[^/]*'
    } else {
      expression += character.replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
    }
  }
  return new RegExp(`${expression}$`)
}

function normalizeSource(source: string) {
  const absolute = path.isAbsolute(source) ? source : path.resolve(appRoot, source)
  const relative = path.relative(appRoot, absolute).split(path.sep).join('/')
  return relative.startsWith('../../') ? source.replace(/^.*apps\/newframe\//, '') : relative
}

function coverageReports(input: string): string[] {
  if (!statSync(input).isDirectory()) return [input]
  return readdirSync(input).flatMap((entry) => {
    const child = path.join(input, entry)
    return statSync(child).isDirectory() ? coverageReports(child) : entry === 'lcov.info' ? [child] : []
  })
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    if (
      ['bundle', 'compiled', 'coverage', 'dist', 'generated', 'node_modules', 'styled-system'].includes(entry)
    ) {
      return []
    }
    const child = path.join(directory, entry)
    if (statSync(child).isDirectory()) return sourceFiles(child)
    const name = normalizeSource(child)
    if (!/\.[cm]?[jt]sx?$/.test(name) || /\.(?:test|spec|test-support|test-fixture)\./.test(name)) {
      return []
    }
    return [name]
  })
}

function parseLcov(reports: string[]) {
  const files = new Map<string, Coverage>()

  for (const report of reports) {
    const source = readFileSync(report, 'utf8')
    for (const record of source.split(/\nend_of_record\s*\n?/)) {
      const sourceLine = record.match(/^SF:(.+)$/m)?.[1]
      if (!sourceLine) continue
      const name = normalizeSource(sourceLine)
      if (/\.(?:test|spec|test-support|test-fixture)\./.test(name)) continue
      const raw: RawCoverage = {
        branches: new Map<string, number>(),
        functionHits: 0,
        functionTotal: 0,
        functions: new Map<string, number>(),
        lines: new Map<string, number>()
      }

      for (const line of record.split('\n')) {
        if (line.startsWith('DA:')) {
          const [lineNumber, hits] = line.slice(3).split(',')
          raw.lines.set(lineNumber, Math.max(raw.lines.get(lineNumber) || 0, Number(hits)))
        } else if (line.startsWith('BRDA:')) {
          const [lineNumber, block, branch, hits] = line.slice(5).split(',')
          const key = `${lineNumber},${block},${branch}`
          const hitCount = hits === '-' ? 0 : Number(hits)
          raw.branches.set(key, Math.max(raw.branches.get(key) || 0, hitCount))
        } else if (line.startsWith('FNDA:')) {
          const [hits, functionName] = line.slice(5).split(',')
          raw.functions.set(functionName, Math.max(raw.functions.get(functionName) || 0, Number(hits)))
        } else if (line.startsWith('FNF:')) {
          raw.functionTotal = Math.max(raw.functionTotal, Number(line.slice(4)))
        } else if (line.startsWith('FNH:')) {
          raw.functionHits = Math.max(raw.functionHits, Number(line.slice(4)))
        }
      }

      const coverage: Coverage = {
        branches: {
          hit: [...raw.branches.values()].filter((hits) => hits > 0).length,
          total: raw.branches.size
        },
        functions: {
          hit:
            raw.functions.size > 0
              ? [...raw.functions.values()].filter((hits) => hits > 0).length
              : raw.functionHits,
          total: raw.functions.size > 0 ? raw.functions.size : raw.functionTotal
        },
        lines: {
          hit: [...raw.lines.values()].filter((hits) => hits > 0).length,
          total: raw.lines.size
        }
      }
      const current = files.get(name)

      // Bun can emit different measurable line sets for the same source when
      // separate test processes load it through different dependency graphs.
      // Combining those records inflates the denominator with incompatible
      // instrumentation. Keep the strongest complete record for each source;
      // this remains conservative for complementary tests while avoiding
      // unrelated imports degrading an owning test's real coverage.
      if (
        !current ||
        coverage.lines.hit > current.lines.hit ||
        (coverage.lines.hit === current.lines.hit && coverage.lines.total < current.lines.total) ||
        (coverage.lines.hit === current.lines.hit &&
          coverage.lines.total === current.lines.total &&
          coverage.functions.hit > current.functions.hit)
      ) {
        files.set(name, coverage)
      }
    }
  }

  return files
}

if (!existsSync(lcovPath)) {
  console.error(`Coverage report not found: ${lcovPath}`)
  console.error('Generate Bun LCOV output before running the critical coverage gate.')
  process.exit(1)
}
if (!existsSync(manifestPath)) {
  console.error(`Coverage manifest not found: ${manifestPath}`)
  process.exit(1)
}

const reports = coverageReports(lcovPath)
if (reports.length === 0) {
  console.error(`No lcov.info reports found under: ${lcovPath}`)
  process.exit(1)
}
const files = parseLcov(reports)
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { groups: Rule[] }
const productionSources = sourceFiles(appRoot)
const failures: string[] = []
const rows = manifest.groups.map((rule) => {
  const matchedByName = new Map<string, Coverage>()

  for (const pattern of rule.patterns) {
    const expression = glob(pattern)
    const sourceMatches = productionSources.filter((name) => expression.test(name))

    if (sourceMatches.length === 0) {
      failures.push(`${rule.name}: pattern "${pattern}" matches no existing production source`)
    }

    for (const name of sourceMatches) {
      const fileCoverage = files.get(name)
      if (!fileCoverage) {
        failures.push(`${rule.name}: pattern "${pattern}" matched "${name}", but it is missing from LCOV`)
        continue
      }

      const measurable = fileCoverage.lines.total > 0 || fileCoverage.functions.total > 0
      if (!measurable) {
        failures.push(
          `${rule.name}: pattern "${pattern}" matched "${name}", but LCOV contains no measurable lines or functions`
        )
      } else if (fileCoverage.lines.total > 0 && fileCoverage.lines.hit === 0) {
        failures.push(
          `${rule.name}: pattern "${pattern}" matched "${name}", but LCOV reports zero executed lines`
        )
      }

      matchedByName.set(name, fileCoverage)
    }
  }

  const matched = [...matchedByName.entries()]
  const coverage = emptyCoverage()
  matched.forEach(([, fileCoverage]) => add(coverage, fileCoverage))

  const values = {
    branches: percentage(coverage.branches),
    functions: percentage(coverage.functions),
    lines: percentage(coverage.lines)
  }
  for (const metric of ['branches', 'functions', 'lines'] as const) {
    const minimum = rule.minimum[metric]
    if (minimum !== undefined && values[metric] < minimum) {
      failures.push(`${rule.name}: ${metric} ${values[metric].toFixed(1)}% is below ${minimum}%`)
    }
  }

  return {
    branches:
      rule.minimum.branches === undefined
        ? 'not emitted by Bun'
        : `${values.branches.toFixed(1)}% / ${rule.minimum.branches}%`,
    files: matched.length,
    functions: `${values.functions.toFixed(1)}% / ${rule.minimum.functions}%`,
    lines: `${values.lines.toFixed(1)}% / ${rule.minimum.lines}%`,
    risk: rule.name
  }
})

console.table(rows)
if (failures.length > 0) {
  const label = reportOnly ? 'Coverage observations' : 'Critical coverage gate failed'
  console.error(`${label}:\n- ${failures.join('\n- ')}`)
  if (!reportOnly) process.exitCode = 1
} else {
  console.log('Critical risk coverage gates passed.')
}
