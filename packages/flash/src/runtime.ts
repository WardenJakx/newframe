import type { FlashRuntime } from './schemas.ts'

export function flashRuntimeFromEnv(): FlashRuntime {
  return { isDev: process.env.FRAME_PROFILE === 'dev' || process.env.NODE_ENV === 'development' }
}
