import { useEffect, useRef } from 'react'

import link from '../../../../resources/link'
import { isEmbeddedImage } from '../../../../resources/domain/image'

export function useChainIconHydration(chainIds: number[], networksMeta: Record<string | number, any>) {
  const hydrating = useRef(new Set<number>())
  const cacheKey = chainIds.join(':')

  useEffect(() => {
    chainIds.forEach((chainId) => {
      const icon = networksMeta[chainId]?.icon
      if ((icon && isEmbeddedImage(icon)) || hydrating.current.has(chainId)) return
      hydrating.current.add(chainId)
      void link.executeCommand({ type: 'network.icon-hydrate', chainId }).finally(() => {
        hydrating.current.delete(chainId)
      })
    })
  }, [cacheKey, networksMeta])
}
