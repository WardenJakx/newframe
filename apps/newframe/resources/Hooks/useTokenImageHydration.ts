import { useEffect, type RefObject } from 'react'

import link from '../link'

const TOKEN_ID = /^\d+:0x[0-9a-f]{40}$/i

export function useTokenImageHydration(
  tokenId: string | undefined,
  hasPersistedImage: boolean,
  targetRef?: RefObject<Element | null>
) {
  useEffect(() => {
    if (hasPersistedImage || !tokenId || !TOKEN_ID.test(tokenId)) return

    const request = () => {
      void link.executeCommand({ type: 'token.image-hydrate', tokenId }).catch(() => {})
    }
    const target = targetRef?.current
    if (!target || typeof IntersectionObserver === 'undefined') {
      request()
      return
    }

    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      observer.disconnect()
      request()
    })
    observer.observe(target)
    return () => observer.disconnect()
  }, [hasPersistedImage, targetRef, tokenId])
}
