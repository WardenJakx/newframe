import type { FlashRuntime } from './schemas.js'

export function flashRuntimeFromEnv(): FlashRuntime {
  return { isDev: process.env.FRAME_PROFILE === 'dev' || process.env.NODE_ENV === 'development' }
}
