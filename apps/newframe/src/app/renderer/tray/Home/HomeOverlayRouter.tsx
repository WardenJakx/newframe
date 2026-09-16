import { useEffect, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'

import { cva } from '../../../../../generated/styled-system/css/cva.js'
import { Accounts } from '../../../../features/accounts/renderer/Accounts'
import { Receive } from '../../../../features/accounts/renderer/Receive'
import { ConnectedDapps } from '../../../../features/connections/renderer/ConnectedDapps'
import { AddChain } from '../../../../features/networks/renderer/AddChain'
import { Networks } from '../../../../features/networks/renderer/Networks'
import { AssetDetails } from '../../../../features/portfolio/renderer/AssetDetails'
import { RequestsOverlay } from '../../../../features/requests/renderer/RequestsOverlay'
import { About } from '../../../../features/settings/renderer/About'
import { Settings } from '../../../../features/settings/renderer/Settings'
import Tokens from '../../../../features/tokens/renderer'
import { ActivityDetails } from '../../../../features/transactions/renderer/activity/ActivityDetails'
import { OrderDetails } from '../../../../features/transactions/trade/renderer/orders/OrderDetails'
import { useWalletSelector } from '../../../../platform/state-sync/renderer/useAppSelector'
import { HomeMenu } from './components/HomeMenu'
import type { HomeCapabilities } from './Home'
import { useHomeUiStore } from './state/HomeUiProvider'
import type { HomeOverlay } from './state/homeUiTypes'

const layersRecipe = cva({ base: { position: 'absolute', inset: 0, zIndex: 'overlay' } })
const layerRecipe = cva({ base: { position: 'absolute', inset: 0 } })

const focusableSelector =
  'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

function focusableElements(layer: HTMLElement) {
  return Array.from(layer.querySelectorAll<HTMLElement>(focusableSelector)).filter(
    (element) => !element.closest('[inert], [hidden], [aria-hidden="true"]')
  )
}

function OverlayLayer({ active, children, index }: { active: boolean; children: ReactNode; index: number }) {
  const layer = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    return () => {
      // Wait until React has removed inert from the layer being revealed.
      queueMicrotask(() => {
        if (!previousFocus?.isConnected || previousFocus.closest('[inert]')) {
          return
        }
        const focusedLayer = document.activeElement?.closest('[data-overlay-focus-managed]')
        if (focusedLayer && focusedLayer !== previousFocus.closest('[data-overlay-focus-managed]')) {
          return
        }
        previousFocus.focus()
      })
    }
  }, [])

  useLayoutEffect(() => {
    if (active && layer.current) {
      ;(focusableElements(layer.current)[0] ?? layer.current).focus()
    }
  }, [active])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!active || event.defaultPrevented || event.key !== 'Tab' || !layer.current) {
      return
    }
    const elements = focusableElements(layer.current)
    const first = elements[0] ?? layer.current
    const last = elements.at(-1) ?? layer.current
    if (event.shiftKey && (document.activeElement === first || document.activeElement === layer.current)) {
      event.preventDefault()
      last.focus()
    } else if (
      !event.shiftKey &&
      (document.activeElement === last || document.activeElement === layer.current)
    ) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div
      aria-hidden={!active || undefined}
      className={layerRecipe()}
      data-overlay-focus-managed
      inert={!active}
      onKeyDown={onKeyDown}
      ref={layer}
      style={{ zIndex: index }}
      tabIndex={-1}
    >
      {children}
    </div>
  )
}

export function HomeOverlayRouter({ capabilities }: { capabilities: HomeCapabilities }) {
  const overlay = useHomeUiStore((state) => state.overlay)
  const history = useHomeUiStore((state) => state.overlayHistory)
  if (overlay.type === 'none') {
    return null
  }

  return (
    <div className={layersRecipe()}>
      {[...history, overlay].map((entry, index) => (
        <OverlayLayer active={index === history.length} index={index} key={`${index}:${entry.type}`}>
          <OverlayRoute
            active={index === history.length}
            capabilities={capabilities}
            hasHistory={index > 0}
            hasMenuHistory={history.slice(0, index).some((item) => item.type === 'menu')}
            overlay={entry}
          />
        </OverlayLayer>
      ))}
    </div>
  )
}

function OverlayRoute({
  active,
  capabilities,
  hasHistory,
  hasMenuHistory,
  overlay
}: {
  active: boolean
  capabilities: HomeCapabilities
  hasHistory: boolean
  hasMenuHistory: boolean
  overlay: Exclude<HomeOverlay, { type: 'none' }>
}) {
  const close = useHomeUiStore((state) => state.closeOverlay)
  const open = useHomeUiStore((state) => state.openOverlay)
  const push = useHomeUiStore((state) => state.pushOverlay)
  const activeRef = useRef(active)
  useLayoutEffect(() => {
    activeRef.current = active
    return () => {
      activeRef.current = false
    }
  }, [active])
  const closeOverlay = () => {
    if (activeRef.current) {
      close()
    }
  }
  const openOverlay = (next: Exclude<HomeOverlay, { type: 'none' }>) => {
    if (activeRef.current) {
      open(next)
    }
  }
  const backToMenu = () => {
    if (hasHistory) {
      closeOverlay()
    } else {
      openOverlay({ type: 'menu' })
    }
  }
  const selectedChainId = useHomeUiStore((state) => state.selectedChainId)
  const setSelectedChainId = useHomeUiStore((state) => state.setSelectedChainId)
  const currentAccount = useWalletSelector((state) => state.currentAccount || '')
  const originatingAccountExists = useWalletSelector((state) =>
    overlay.type === 'asset' ? !!state.accounts?.[overlay.accountId] : true
  )

  const staleAssetOverlay =
    overlay.type === 'asset' &&
    (!currentAccount || !originatingAccountExists || overlay.accountId !== currentAccount)

  useEffect(() => {
    if (active && staleAssetOverlay) {
      close()
    }
  }, [active, close, staleAssetOverlay])

  if (staleAssetOverlay) {
    return null
  }

  switch (overlay.type) {
    case 'menu':
      return <HomeMenu capability={capabilities.home} />
    case 'accounts':
      return (
        <Accounts capability={capabilities.accounts} camera={capabilities.camera} onClose={closeOverlay} />
      )
    case 'networks':
      return (
        <Networks
          capability={capabilities.networks}
          onClose={closeOverlay}
          onSelectionChange={setSelectedChainId}
          selectedChainId={selectedChainId}
        />
      )
    case 'settings':
      return (
        <Settings
          capability={capabilities.settings}
          onBack={backToMenu}
          onPostLockNavigation={() => openOverlay({ type: 'menu' })}
          onSelectedChainChange={setSelectedChainId}
          selectedChainId={selectedChainId}
          security={capabilities.security}
        />
      )
    case 'about':
      return <About capability={capabilities.settings} onBack={backToMenu} />
    case 'requests':
      return (
        <RequestsOverlay
          capabilities={capabilities.requests}
          onBack={closeOverlay}
          onRecoverSigner={capabilities.recoverSigner}
          onAirGapSigning={capabilities.airgapSigning}
        />
      )
    case 'dapps':
      return <ConnectedDapps capability={capabilities.connections} onBack={backToMenu} />
    case 'tokens':
      return (
        <Tokens
          capability={capabilities.tokens}
          initialToken={overlay.initialToken}
          onBack={backToMenu}
          onOpenNetworks={() => {
            if (!activeRef.current) {
              return
            }
            if (hasMenuHistory) {
              push({ type: 'networks' })
            } else {
              openOverlay({ type: 'networks' })
            }
          }}
        />
      )
    case 'addChain':
      return (
        <AddChain
          capability={capabilities.networks}
          onResolved={(outcome) => {
            if (outcome === 'approved') {
              openOverlay({ type: 'networks' })
            } else {
              closeOverlay()
            }
          }}
          pending={overlay.pending}
        />
      )
    case 'asset':
      return (
        <AssetDetails
          asset={overlay.asset}
          capability={capabilities.portfolio}
          onBack={closeOverlay}
          selectedChainId={selectedChainId}
        />
      )
    case 'activity':
      return (
        <ActivityDetails
          activityId={overlay.activityId}
          capability={capabilities.activity}
          onBack={closeOverlay}
        />
      )
    case 'order':
      return (
        <OrderDetails
          assetImages={overlay.assetImages}
          capability={capabilities.orders}
          onBack={closeOverlay}
          orderId={overlay.orderId}
        />
      )
    case 'receive':
      return (
        <Receive accountId={overlay.accountId} capability={capabilities.accounts} onBack={closeOverlay} />
      )
    default:
      return assertNever(overlay)
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported Home overlay: ${JSON.stringify(value)}`)
}
