import { existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const appRoot = path.resolve(import.meta.dirname, '..')
const testArtifact =
  /(?:^|\/)(?:__mocks__|__tests__)(?:\/|$)|(?:^|\/)[^/]+\.(?:test|spec|test-support|test-fixture)\./

function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const target = path.join(directory, entry)
    return statSync(target).isDirectory() ? walk(target) : [target]
  })
}

const requestedRoots = process.argv.slice(2)

if (requestedRoots.length === 0) {
  console.error('Provide at least one build output directory to inspect')
  process.exit(1)
}

const artifacts = requestedRoots.flatMap((root) => {
  const outputRoot = path.resolve(appRoot, root)

  if (!existsSync(outputRoot)) {
    console.error(`Build output does not exist: ${path.relative(appRoot, outputRoot)}`)
    process.exit(1)
  }

  return walk(outputRoot)
    .map((file) => path.relative(appRoot, file).split(path.sep).join('/'))
    .filter((file) => testArtifact.test(file))
})

if (artifacts.length > 0) {
  console.error(
    `Test-only files were emitted into build output:\n${artifacts.map((file) => `- ${file}`).join('\n')}`
  )
  process.exit(1)
}
