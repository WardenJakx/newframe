import { describe, expect, it } from 'bun:test'

import { getMainRuntime } from '../../main/runtime'

describe('main runtime', () => {
  it('defaults an installed app without NODE_ENV to production', () => {
    expect(getMainRuntime({ env: {} })).toEqual({
      environment: 'production',
      isDev: false,
      profile: null
    })
  })

  it('keeps explicit development signals in the development runtime', () => {
    expect(getMainRuntime({ env: { FRAME_PROFILE: 'dev' } }).isDev).toBe(true)
    expect(getMainRuntime({ env: { NODE_ENV: 'development' } }).isDev).toBe(true)
    expect(getMainRuntime({ env: {}, defaultApp: true }).isDev).toBe(true)
  })
})
