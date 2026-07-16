import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'

const packageRoot = path.resolve(import.meta.dirname, '..')
const sourceRoot = path.join(packageRoot, 'src')
const outputRoot = path.join(packageRoot, 'dist')

async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory).catch(() => [])
  return (
    await Promise.all(
      entries.map(async (entry) => {
        const target = path.join(directory, entry)
        return (await stat(target)).isDirectory() ? walk(target) : [target]
      })
    )
  ).flat()
}

const sourceFiles = await walk(sourceRoot)
const problems: string[] = []

for (const source of sourceFiles) {
  const relative = path.relative(sourceRoot, source)
  if ((source.endsWith('.ts') || source.endsWith('.tsx')) && !source.endsWith('.d.ts')) {
    const stem = relative.replace(/\.tsx?$/, '')
    for (const extension of ['.js', '.js.map', '.d.ts', '.d.ts.map']) {
      const artifact = path.join(outputRoot, `${stem}${extension}`)
      if ((await stat(artifact).catch(() => undefined)) === undefined)
        problems.push(path.relative(packageRoot, artifact))
    }
  } else if (source.endsWith('.css') || source.includes(`${path.sep}assets${path.sep}`)) {
    const artifact = path.join(outputRoot, relative)
    const [sourceBytes, artifactBytes] = await Promise.all([
      readFile(source),
      readFile(artifact).catch(() => Buffer.from(''))
    ])
    if (!sourceBytes.equals(artifactBytes)) problems.push(path.relative(packageRoot, artifact))
  }
}

if (problems.length > 0) {
  console.error(`UI build artifacts are missing or stale:\n${problems.map((file) => `- ${file}`).join('\n')}`)
  process.exit(1)
}
