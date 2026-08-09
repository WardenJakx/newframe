import { useEffect, useRef, useState } from 'react'

import type { PersistSetting } from './types'

export function useSettingsDrafts({
  initialLatticeEndpoint,
  initialLatticeEndpointMode,
  initialPortfolioApiKeyConfigured,
  persist
}: {
  initialLatticeEndpoint: string
  initialLatticeEndpointMode: 'default' | 'custom'
  initialPortfolioApiKeyConfigured: boolean
  persist: PersistSetting
}) {
  const latticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const portfolioTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [latticeEndpoint, setLatticeEndpoint] = useState(initialLatticeEndpoint)
  const [latticeEndpointMode, setLatticeEndpointMode] = useState(initialLatticeEndpointMode)
  const [portfolioApiKey, setPortfolioApiKey] = useState('')
  const [portfolioApiKeyRequired, setPortfolioApiKeyRequired] = useState(false)

  useEffect(
    () => () => {
      clearTimeout(latticeTimer.current)
      clearTimeout(portfolioTimer.current)
    },
    []
  )

  const changeLatticeEndpoint = (input: string) => {
    const value = input.replace(/\s+/g, '')
    clearTimeout(latticeTimer.current)
    setLatticeEndpoint(value)
    latticeTimer.current = setTimeout(() => persist({ setting: 'lattice-endpoint', value }), 1000)
  }

  const changePortfolioApiKey = (input: string) => {
    const value = input.replace(/\s+/g, '')
    clearTimeout(portfolioTimer.current)
    setPortfolioApiKey(value)
    setPortfolioApiKeyRequired(false)
    portfolioTimer.current = setTimeout(() => persist({ setting: 'portfolio-api-key', value }), 1000)
  }

  const changeLatticeEndpointMode = (value: 'default' | 'custom') => {
    setLatticeEndpointMode(value)
    persist({ setting: 'lattice-endpoint-mode', value })
  }

  const toggleAutoDiscoverTokens = (enabled: boolean) => {
    if (enabled) return persist({ setting: 'auto-discover-tokens', value: false })

    const apiKey = portfolioApiKey.trim()
    if (!apiKey && !initialPortfolioApiKeyConfigured) return setPortfolioApiKeyRequired(true)

    clearTimeout(portfolioTimer.current)
    persist({
      setting: 'auto-discover-tokens',
      value: true,
      ...(apiKey ? { apiKey } : {})
    })
    if (apiKey) setPortfolioApiKey(apiKey)
    setPortfolioApiKeyRequired(false)
  }

  return {
    changeLatticeEndpoint,
    changeLatticeEndpointMode,
    changePortfolioApiKey,
    latticeEndpoint,
    latticeEndpointMode,
    portfolioApiKey,
    portfolioApiKeyConfigured: initialPortfolioApiKeyConfigured || portfolioApiKey.trim().length > 0,
    portfolioApiKeyRequired,
    toggleAutoDiscoverTokens
  }
}
