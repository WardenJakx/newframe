import { copyFile, mkdir } from 'fs/promises'
import { dirname, join, resolve } from 'path'

const appRoot = resolve(dirname(process.argv[1]), '..')
const repoRoot = resolve(appRoot, '../..')
const brandAssets = join(repoRoot, 'assets/brand/newframe')

const copies: Array<[string, string]> = [
  ['tray-icon.png', 'compiled/main/windows/Icon.png'],
  ['tray-icon@2x.png', 'compiled/main/windows/Icon@2x.png'],
  ['tray-icon-template.png', 'compiled/main/windows/IconTemplate.png'],
  ['tray-icon-template@2x.png', 'compiled/main/windows/IconTemplate@2x.png'],
  ['app-icon.png', 'compiled/main/windows/AppIcon.png'],
  ['app-icon.png', 'build/icons/icon.png'],
  ['app-icon.png', 'build/icons/512x512.png']
]

async function copyAsset(sourceName: string, targetPath: string) {
  const destination = join(appRoot, targetPath)

  await mkdir(dirname(destination), { recursive: true })
  await copyFile(join(brandAssets, sourceName), destination)
}

async function main() {
  await Promise.all(copies.map(([sourceName, targetPath]) => copyAsset(sourceName, targetPath)))

  console.log('Synced Newframe assets')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
