import { copyFile, mkdir, readdir, stat } from 'node:fs/promises'
import path from 'node:path'

const packageRoot = path.resolve(import.meta.dirname, '..')
const sourceRoot = path.join(packageRoot, 'src')
const outputRoot = path.join(packageRoot, 'dist')

async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory)
  return (
    await Promise.all(
      entries.map(async (entry) => {
        const target = path.join(directory, entry)
        return (await stat(target)).isDirectory() ? walk(target) : [target]
      })
    )
  ).flat()
}

export async function copyAssets() {
  const assets = (await walk(sourceRoot)).filter(
    (file) => file.endsWith('.css') || file.includes(`${path.sep}assets${path.sep}`)
  )
  await Promise.all(
    assets.map(async (source) => {
      const destination = path.join(outputRoot, path.relative(sourceRoot, source))
      await mkdir(path.dirname(destination), { recursive: true })
      await copyFile(source, destination)
    })
  )
}

if (path.resolve(process.argv[1] || '') === path.resolve(import.meta.filename)) await copyAssets()
