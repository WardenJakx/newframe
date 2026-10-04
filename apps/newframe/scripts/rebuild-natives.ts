import { spawnSync } from 'node:child_process'

// usb's binding.gyp pins C++14 on Linux, but its node-addon-api headers need C++17 and Electron's need C++20.
// Flags from the environment come last, so they win.
const env =
  process.platform === 'linux'
    ? { ...process.env, CXXFLAGS: [process.env.CXXFLAGS, '-std=gnu++20'].filter(Boolean).join(' ') }
    : process.env

const result = spawnSync('electron-builder', ['install-app-deps'], { env, stdio: 'inherit' })
process.exit(result.status ?? 1)
