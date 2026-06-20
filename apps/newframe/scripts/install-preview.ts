import { existsSync, mkdirSync, readdirSync, rmSync } from 'fs'
import { spawnSync } from 'child_process'
import path from 'path'

const appName = 'Newframe.app'
const outputDir = path.resolve(process.cwd(), 'dist-preview')
const installDir = process.env.FRAME_PREVIEW_INSTALL_DIR || '/Applications'
const preferredDirs = [`mac-${process.arch}`, 'mac']

function appPath(dir: string) {
  return path.join(outputDir, dir, appName)
}

if (!existsSync(outputDir)) {
  throw new Error(`Preview output not found: ${outputDir}`)
}

const dirs = readdirSync(outputDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)

const previewApp = preferredDirs.map(appPath).find(existsSync) || dirs.map(appPath).find(existsSync)

if (!previewApp) {
  throw new Error(`Could not find ${appName} in ${outputDir}`)
}

mkdirSync(installDir, { recursive: true })

const destination = path.join(installDir, appName)
rmSync(destination, { recursive: true, force: true })

const result = spawnSync('ditto', [previewApp, destination], { stdio: 'inherit' })

if (result.error) throw result.error
if (result.status !== 0) process.exit(result.status || 1)

console.log(`Installed ${destination}`)
