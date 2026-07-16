import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'

const appRoot = path.resolve(__dirname, '..')
const sourceRoots = ['app', 'main', 'resources']
const sourceExtensions = new Set(['.css', '.js', '.jsx', '.styl', '.ts', '.tsx'])
const allowedFiles = new Set([path.join('resources', 'colors', 'index.ts')])

export type ColorLiteralViolation = {
  column: number
  line: number
  literal: string
}

function stripBlockComments(source: string) {
  return source.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))
}

export function findColorLiteralViolations(source: string): ColorLiteralViolation[] {
  const withoutBlocks = stripBlockComments(source)
  const violations: ColorLiteralViolation[] = []
  const colorFunction = /(?<![A-Za-z0-9_])(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\s*\([^)]*\)/gi
  const hex = /#[0-9a-f]{3,8}\b/gi
  const keyword =
    /(?:color|background(?:-color)?|fill|stroke|border(?:-[a-z]+)?(?:-color)?)\s*[:= ]\s*(white|black)\b/gi

  withoutBlocks.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.replace(/\/\/.*$/, '')
    const matches = [...line.matchAll(colorFunction), ...line.matchAll(hex), ...line.matchAll(keyword)]

    for (const match of matches) {
      violations.push({
        column: (match.index || 0) + 1,
        line: index + 1,
        literal: match[1] || match[0]
      })
    }
  })

  return violations.sort((a, b) => a.line - b.line || a.column - b.column)
}

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir)
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry)
      return (await stat(fullPath)).isDirectory() ? walk(fullPath) : [fullPath]
    })
  )
  return files.flat()
}

export async function findApplicationColorLiterals() {
  const files = (await Promise.all(sourceRoots.map((root) => walk(path.join(appRoot, root))))).flat()
  const results: Array<ColorLiteralViolation & { file: string }> = []

  for (const file of files) {
    const relativePath = path.relative(appRoot, file)
    if (!sourceExtensions.has(path.extname(file)) || allowedFiles.has(relativePath)) continue

    const violations = findColorLiteralViolations(await readFile(file, 'utf8'))
    results.push(...violations.map((violation) => ({ file: relativePath, ...violation })))
  }

  return results
}

async function main() {
  const violations = await findApplicationColorLiterals()
  if (violations.length === 0) return

  console.error('Color literals must be defined in @newframe/ui tokens or application-owned color metadata:')
  violations.forEach(({ file, line, column, literal }) => {
    console.error(`- ${file}:${line}:${column} ${literal}`)
  })
  process.exit(1)
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
