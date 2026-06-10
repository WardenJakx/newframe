const path = require('path')
const fs = require('fs')
const { app } = require('electron')
const log = require('electron-log')

// Electron has no login item support on Linux, so manage an XDG autostart entry directly
const isLinux = process.platform === 'linux'

// on Linux app.getPath('appData') is XDG_CONFIG_HOME (~/.config);
// 'Frame.desktop' matches the file previously written by auto-launch
const desktopEntryPath = () => path.join(app.getPath('appData'), 'autostart', 'Frame.desktop')

// when running as an AppImage the mounted executable path is temporary,
// so the persistent image path must be used instead
const execPath = () => process.env.APPIMAGE || process.execPath

const desktopEntry = () =>
  [
    '[Desktop Entry]',
    'Type=Application',
    'Name=Frame',
    'Comment=System-wide web3',
    `Exec="${execPath()}"`,
    'Terminal=false'
  ].join('\n') + '\n'

const linux = {
  enable: () => {
    fs.mkdirSync(path.dirname(desktopEntryPath()), { recursive: true })
    fs.writeFileSync(desktopEntryPath(), desktopEntry())
  },
  disable: () => fs.rmSync(desktopEntryPath(), { force: true }),
  isEnabled: () => fs.existsSync(desktopEntryPath())
}

module.exports = {
  enable: () => {
    try {
      isLinux ? linux.enable() : app.setLoginItemSettings({ openAtLogin: true })
    } catch (e) {
      log.error('Error enabling launch on startup', e)
    }
  },
  disable: () => {
    try {
      isLinux ? linux.disable() : app.setLoginItemSettings({ openAtLogin: false })
    } catch (e) {
      log.error('Error disabling launch on startup', e)
    }
  },
  status: (cb) => {
    try {
      cb(null, isLinux ? linux.isEnabled() : app.getLoginItemSettings().openAtLogin)
    } catch (e) {
      cb(e)
    }
  }
}
