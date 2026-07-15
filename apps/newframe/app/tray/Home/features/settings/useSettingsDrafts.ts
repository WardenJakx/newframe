import { useEffect, useRef, useState } from 'react'

export function useSettingsDrafts({
  initialLatticeEndpoint,
  initialLatticeEndpointMode,
  initialPortfolioApiKey,
  persist
}: {
  initialLatticeEndpoint: string
  initialLatticeEndpointMode: string
  initialPortfolioApiKey: string
  persist: (setting: string, value: any) => void
}) {
  const latticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const portfolioTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [latticeEndpoint, setLatticeEndpoint] = useState(initialLatticeEndpoint)
  const [latticeEndpointMode, setLatticeEndpointMode] = useState(initialLatticeEndpointMode)
  const [portfolioApiKey, setPortfolioApiKey] = useState(initialPortfolioApiKey)
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
    latticeTimer.current = setTimeout(() => persist('lattice-endpoint', value), 1000)
  }

  const changePortfolioApiKey = (input: string) => {
    const value = input.replace(/\s+/g, '')
    clearTimeout(portfolioTimer.current)
    setPortfolioApiKey(value)
    setPortfolioApiKeyRequired(false)
    portfolioTimer.current = setTimeout(() => persist('portfolio-api-key', value), 1000)
  }

  const changeLatticeEndpointMode = (value: string) => {
    setLatticeEndpointMode(value)
    persist('lattice-endpoint-mode', value)
  }

  const toggleAutoDiscoverTokens = (enabled: boolean) => {
    if (enabled) return persist('auto-discover-tokens', false)

    const apiKey = portfolioApiKey.trim()
    if (!apiKey) return setPortfolioApiKeyRequired(true)

    clearTimeout(portfolioTimer.current)
    persist('auto-discover-tokens', { enabled: true, apiKey })
    setPortfolioApiKey(apiKey)
    setPortfolioApiKeyRequired(false)
  }

  return {
    changeLatticeEndpoint,
    changeLatticeEndpointMode,
    changePortfolioApiKey,
    latticeEndpoint,
    latticeEndpointMode,
    portfolioApiKey,
    portfolioApiKeyRequired,
    toggleAutoDiscoverTokens
  }
}
