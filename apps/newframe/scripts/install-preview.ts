import { spawnSync } from 'child_process'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync
} from 'fs'
import { tmpdir } from 'os'
import path from 'path'

const outputDir = path.resolve(process.cwd(), 'dist-preview')

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { stdio: 'inherit' })

  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    throw new Error(`${command} exited with code ${result.status}`)
  }
}

function installMac() {
  const appName = 'Newframe.app'
  const installDir = process.env.FRAME_PREVIEW_INSTALL_DIR ?? '/Applications'
  const preferredDirs = [`mac-${process.arch}`, 'mac']
  const appPath = (dir: string) => path.join(outputDir, dir, appName)

  const dirs = readdirSync(outputDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)

  const previewApp = preferredDirs.map(appPath).find(existsSync) ?? dirs.map(appPath).find(existsSync)

  if (!previewApp) {
    throw new Error(`Could not find ${appName} in ${outputDir}`)
  }

  mkdirSync(installDir, { recursive: true })

  const destination = path.join(installDir, appName)
  rmSync(destination, { recursive: true, force: true })
  run('ditto', [previewApp, destination])

  console.log(`Installed ${destination}`)
}

function installLinux() {
  const [deb] = readdirSync(outputDir)
    .filter((name) => name.endsWith('.deb'))
    .map((name) => path.join(outputDir, name))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)

  if (!deb) {
    throw new Error(`Could not find a .deb in ${outputDir}`)
  }

  // apt reads local packages as its unprivileged `_apt` user, which cannot enter the home directory.
  const stagingDir = mkdtempSync(path.join(tmpdir(), 'newframe-preview-'))
  try {
    chmodSync(stagingDir, 0o755)
    const stagedDeb = path.join(stagingDir, path.basename(deb))
    copyFileSync(deb, stagedDeb)
    chmodSync(stagedDeb, 0o644)
    // Previews keep the release version, so apt must reinstall over (or downgrade) whatever is installed.
    run('sudo', ['apt-get', 'install', '--yes', '--reinstall', '--allow-downgrades', stagedDeb])
  } finally {
    rmSync(stagingDir, { recursive: true, force: true })
  }

  console.log(`Installed ${deb}`)
}

if (!existsSync(outputDir)) {
  throw new Error(`Preview output not found: ${outputDir}`)
}

if (process.platform === 'darwin') {
  installMac()
} else if (process.platform === 'linux') {
  installLinux()
} else {
  throw new Error(`Preview install is not supported on ${process.platform}`)
}
