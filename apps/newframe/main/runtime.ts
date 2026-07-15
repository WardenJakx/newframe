import type { FlashRuntime } from '../resources/domain/flash/schemas'

type RuntimeProcess = {
  env: {
    FRAME_PROFILE?: string
    NODE_ENV?: string
  }
  defaultApp?: boolean
}

export interface MainRuntime extends FlashRuntime {
  environment: string
  isDev: boolean
  profile: string | null
}

export function getMainRuntime(runtimeProcess: RuntimeProcess = process): MainRuntime {
  const environment = runtimeProcess.env.NODE_ENV || null
  const profile = runtimeProcess.env.FRAME_PROFILE || null
  const isDev = profile === 'dev' || environment === 'development' || Boolean(runtimeProcess.defaultApp)

  return {
    environment: environment || (isDev ? 'development' : 'production'),
    isDev,
    profile
  }
}
