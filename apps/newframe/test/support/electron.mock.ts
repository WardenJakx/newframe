import { mock } from 'bun:test'

export const electronMock = {
  app: {
    getName: mock(() => 'Frame'),
    getPath: mock(() => import.meta.dirname),
    getVersion: mock(() => '0.0.0-test'),
    on: mock(),
    quit: mock(),
    relaunch: mock()
  },
  BrowserWindow: mock(),
  clipboard: {
    writeText: mock()
  },
  dialog: {
    showErrorBox: mock(),
    showMessageBoxSync: mock()
  },
  globalShortcut: {
    register: mock(),
    unregister: mock()
  },
  ipcMain: {
    handle: mock(),
    on: mock()
  },
  ipcRenderer: {
    invoke: mock(),
    on: mock(),
    send: mock()
  },
  Menu: {
    buildFromTemplate: mock()
  },
  net: {
    fetch: mock()
  },
  Notification: mock(),
  powerMonitor: {
    on: mock(),
    off: mock()
  },
  protocol: {
    handle: mock(),
    registerSchemesAsPrivileged: mock()
  },
  safeStorage: {
    decryptString: mock(),
    encryptString: mock(),
    isEncryptionAvailable: mock(() => false)
  },
  screen: {
    getPrimaryDisplay: mock()
  },
  shell: {
    openExternal: mock()
  },
  systemPreferences: {
    canPromptTouchID: mock(() => false),
    promptTouchID: mock()
  },
  Tray: mock()
}
