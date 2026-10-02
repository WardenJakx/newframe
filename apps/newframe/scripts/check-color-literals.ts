import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

import { darkColorSemantics, systemColors } from '../../../packages/ui/src/tokens/colors'
import { elevationTokens } from '../../../packages/ui/src/tokens/elevation'

const repositoryRoot = path.resolve(import.meta.dirname, '../../..')
const sourceRoots = ['apps', 'packages']
const sourceExtensions = new Set(['.css', '.html', '.js', '.jsx', '.mjs', '.styl', '.ts', '.tsx'])
const ignoredDirectories = new Set(
  'node_modules dist dist-preview bundle compiled coverage generated styled-system test scripts'.split(' ')
)
const allowedFiles = new Set([
  'packages/ui/src/tokens/colors.ts',
  'apps/newframe/src/features/networks/domain/chain/colors.ts'
])
const semanticNames = [...Object.keys(darkColorSemantics), ...Object.keys(systemColors)]
const semanticTokens = new Set(
  semanticNames.map((name) => name.replace(/-default$/, '').replaceAll('-', '.'))
)
const semanticVariables = new Set(semanticNames.map((name) => name.replace(/-default$/, '')))
const shadowTokens = new Set(Object.keys(elevationTokens).map((name) => name.replace(/^nf-/, '')))
const colorKeywords = new Set(
  'transparent currentColor inherit initial unset revert revert-layer none'.split(' ')
)
const namedColors = new Set(
  'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen'.split(
    ' '
  )
)
// These variables carry chain metadata rather than UI palette choices.
const metadataVariables = new Set('--chain-dot-color --chain-icon-color --request-chain-color'.split(' '))
const allowedValues = new Set([
  ...semanticTokens,
  ...shadowTokens,
  ...colorKeywords,
  ...Array.from(semanticTokens, (name) => `token(colors.${name})`),
  ...Array.from(semanticVariables, (name) => `var(--colors-${name})`),
  ...Array.from(metadataVariables, (name) => `var(${name})`)
])
const colorProperty =
  '(?:color|background(?:Color|Image|-color|-image)?|(?:border|outline)(?:Top|Right|Bottom|Left|Block|Inline|BlockStart|BlockEnd|InlineStart|InlineEnd|-top|-right|-bottom|-left)?(?:Color|-color)|fill|stroke|caretColor|accentColor|textDecorationColor|boxShadow|textShadow|--[\\w-]+-color)'
const isTestFile = (file: string) =>
  /(?:^|\/)[^/]+\.(?:test|spec|test-support|test-fixture)\.[cm]?[jt]sx?$/.test(file) ||
  /(?:^|\/)(?:__mocks__|__tests__)(?:\/|$)/.test(file)

export type ColorLiteralViolation = {
  column: number
  line: number
  literal: string
}

function stripComments(source: string) {
  return source.replace(/(['"`])(?:\\[\s\S]|(?!\1)[^\\])*?\1|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g, (match) =>
    match.startsWith('/') ? match.replace(/[^\r\n]/g, ' ') : match
  )
}

export function findColorLiteralViolations(source: string, allowPrimitives = false): ColorLiteralViolation[] {
  const cleaned = stripComments(source)
  const violations: ColorLiteralViolation[] = []
  const positions = new Set<number>()
  const add = (index: number, literal: string) => {
    if (positions.has(index)) {
      return
    }
    positions.add(index)
    const before = cleaned.slice(0, index).split('\n')
    violations.push({ column: before.at(-1)!.length + 1, line: before.length, literal })
  }
  const rawColors =
    /(?<![A-Za-z0-9_])(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\s*\([^)]*\)|#[0-9a-f]{3,8}\b/gi

  for (const match of cleaned.matchAll(rawColors)) {
    add(match.index, match[0])
  }

  const declarations = new RegExp(
    `(?<![\\w-])(?:${colorProperty}['"]?\\s*:|(?:fill|stroke)\\s*=)\\s*(['"\x60])([^'"\x60\\r\\n]*)\\1`,
    'g'
  )
  for (const match of cleaned.matchAll(declarations)) {
    const value = match[2]
    if (!allowedValues.has(value) && !value.match(rawColors)) {
      add(match.index, value)
    }
  }

  const unquoted = new RegExp(
    `(?<![\\w-])(?:${colorProperty}|border|outline)\\s*[:= ]\\s*(?:['"\x60])?(?:[\\d.]+(?:px|rem|em)\\s+)?(?:solid\\s+)?([a-z]+)\\b(?![\\w.(])`,
    'gi'
  )
  for (const match of cleaned.matchAll(unquoted)) {
    if (namedColors.has(match[1].toLowerCase())) {
      add(match.index, match[1])
    }
  }

  for (const match of cleaned.matchAll(
    /var\(--colors-([\w-]+)\)|(?:token\(colors\.|\{colors\.|['"`]colors\.)([\w.-]+)[)}'"`]?/g
  )) {
    if (!(match[1] ? semanticVariables.has(match[1]) : semanticTokens.has(match[2]))) {
      add(match.index, match[0])
    }
  }

  if (!allowPrimitives) {
    for (const match of cleaned.matchAll(/\bcolorPrimitives\b/g)) {
      add(match.index, match[0])
    }
  }

  return violations.sort((a, b) => a.line - b.line || a.column - b.column)
}

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = await Promise.all(
    entries
      .filter((entry) => !ignoredDirectories.has(entry.name))
      .map(async (entry) => {
        const fullPath = path.join(dir, entry.name)
        return entry.isDirectory() ? walk(fullPath) : [fullPath]
      })
  )
  return files.flat()
}

export async function findApplicationColorLiterals() {
  const files = (await Promise.all(sourceRoots.map((root) => walk(path.join(repositoryRoot, root))))).flat()
  const results: Array<ColorLiteralViolation & { file: string }> = []

  for (const file of files) {
    const relativePath = path.relative(repositoryRoot, file)
    if (
      !sourceExtensions.has(path.extname(file)) ||
      isTestFile(relativePath) ||
      relativePath.endsWith('.d.ts') ||
      allowedFiles.has(relativePath)
    ) {
      continue
    }

    const violations = findColorLiteralViolations(
      await readFile(file, 'utf8'),
      relativePath === 'packages/ui/panda.preset.ts'
    )
    results.push(...violations.map((violation) => ({ file: relativePath, ...violation })))
  }

  return results
}

async function main() {
  const violations = await findApplicationColorLiterals()
  if (violations.length === 0) {
    return
  }

  console.error(
    'UI colors must use @newframe/ui semantic tokens; literals belong in the color registry or chain metadata:'
  )
  violations.forEach(({ file, line, column, literal }) => {
    console.error(`- ${file}:${line}:${column} ${literal}`)
  })
  process.exit(1)
}

if (import.meta.main) {
  main().catch((err: unknown) => {
    console.error(err)
    process.exit(1)
  })
}
