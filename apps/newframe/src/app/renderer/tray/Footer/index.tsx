import { useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'

import type { WalletRendererState } from '../../../../platform/state-sync/contract/projections'
import { RequestActions } from '../../../../features/requests/renderer/ui/RequestActions'
import { cva } from '../../../../../generated/styled-system/css/cva.js'
import { isHardwareSigner } from '../../../../platform/signing/domain'
import { useWalletSelector } from '../../../../platform/state-sync/renderer/useAppSelector'
import { useRequestView, type RequestViewStep } from '../../../../features/requests/renderer/requestView'
import RequestCommand, {
  type RequestCommandNotifier,
  type RequestCommandRequest
} from '../../../../features/requests/renderer/RequestCommand'
import type { RequestRendererCapabilities } from '../../../../features/requests/renderer/requestCapabilities'

interface FooterSharedState {
  account?: WalletRendererState['accounts'][string]
  crumb: { view?: string; data?: unknown }
  req?: RequestCommandRequest
}

interface FooterProps {
  capabilities: Pick<RequestRendererCapabilities, 'external' | 'review' | 'transaction'>
  notify: RequestCommandNotifier
  shared: FooterSharedState
  step: RequestViewStep
}

const footerRecipe = cva({
  base: {
    position: 'absolute',
    insetInline: 0,
    insetBlockEnd: 0,
    zIndex: 'overlay',
    background: 'bg.primary'
  },
  variants: {
    active: {
      true: { padding: '4' },
      false: { padding: '0' }
    }
  }
})

const FOOTER_HEIGHT_PROPERTY = '--tray-footer-height'

const EMPTY_CRUMB = {}

const selectFooterState = (state: WalletRendererState): FooterSharedState => {
  const crumb = state.windows.panel.nav[0] || EMPTY_CRUMB
  const data =
    crumb.view === 'requestView' ? (crumb.data as { accountId?: string; requestId?: string }) : undefined
  const accountId = data?.accountId
  const requestId = data?.requestId
  const account = accountId ? state.accounts[accountId] : undefined
  return { account, crumb, req: requestId ? account?.requests[requestId] : undefined }
}

export function Footer({ capabilities, notify, shared, step }: FooterProps) {
  const footerRef = useRef<HTMLElement>(null)
  const { account, crumb, req } = shared

  useEffect(() => {
    const updateFooterHeight = () => {
      document.documentElement.style.setProperty(
        FOOTER_HEIGHT_PROPERTY,
        `${footerRef.current?.clientHeight ?? 0}px`
      )
    }

    updateFooterHeight()
    const observer =
      typeof ResizeObserver !== 'undefined' && footerRef.current
        ? new ResizeObserver(updateFooterHeight)
        : undefined
    if (footerRef.current) observer?.observe(footerRef.current)

    return () => {
      observer?.disconnect()
      document.documentElement.style.removeProperty(FOOTER_HEIGHT_PROPERTY)
    }
  }, [])

  let content = null

  if (
    crumb.view === 'requestView' &&
    req &&
    account &&
    ['transaction', 'sign', 'signTypedData', 'signErc20Permit'].includes(req.type) &&
    step === 'confirm'
  ) {
    content = (
      <RequestCommand
        capabilities={capabilities}
        notify={notify}
        req={req}
        signingDelay={isHardwareSigner(account.lastSignerType) ? 0 : 1500}
      />
    )
  }

  if (!req) {
    return <footer className={footerRecipe({ active: false })} ref={footerRef} />
  }

  const reject = () => void capabilities.review.reject({ requestId: req.handlerId })
  let primary: { label: string; onPress: () => void } | undefined

  if (!content && req?.type === 'access') {
    primary = {
      label: 'Approve',
      onPress: () => void capabilities.review.resolveAccess({ requestId: req.handlerId, approved: true })
    }
  } else if (!content && req?.type === 'agentAccess') {
    primary = {
      label: 'Allow autonomous access',
      onPress: () =>
        void capabilities.review.resolveAgentAccess({
          requestId: req.handlerId,
          approved: true
        })
    }
  } else if (!content && req?.type === 'switchChain') {
    primary = {
      label: 'Switch',
      onPress: () =>
        void capabilities.review.resolveSwitchChain({
          requestId: req.handlerId,
          approved: true
        })
    }
  } else if (!content && req?.type === 'addChain') {
    primary = {
      label: 'Review',
      onPress: () => void capabilities.review.reviewAddChain({ requestId: req.handlerId })
    }
  } else if (!content && req?.type === 'addToken') {
    primary = {
      label: 'Review',
      onPress: () => void capabilities.review.reviewAddToken({ requestId: req.handlerId })
    }
  }

  const secondary = primary
    ? req.type === 'access'
      ? {
          label: 'Decline',
          onPress: () =>
            void capabilities.review.resolveAccess({
              requestId: req.handlerId,
              approved: false
            })
        }
      : req.type === 'agentAccess'
        ? {
            label: 'Decline',
            onPress: () =>
              void capabilities.review.resolveAgentAccess({
                requestId: req.handlerId,
                approved: false
              })
          }
        : req.type === 'switchChain'
          ? {
              label: 'Decline',
              onPress: () =>
                void capabilities.review.resolveSwitchChain({
                  requestId: req.handlerId,
                  approved: false
                })
            }
          : { label: 'Decline', onPress: reject }
    : undefined

  if (primary && secondary) content = <RequestActions primary={primary} secondary={secondary} />

  return (
    <footer className={footerRecipe({ active: Boolean(content) })} ref={footerRef}>
      {content}
    </footer>
  )
}

export default function FooterContainer({
  capabilities,
  notify
}: {
  capabilities: Pick<RequestRendererCapabilities, 'external' | 'review' | 'transaction'>
  notify: RequestCommandNotifier
}) {
  const shared = useWalletSelector(useShallow(selectFooterState))
  const { step } = useRequestView()
  return <Footer capabilities={capabilities} notify={notify} shared={shared} step={step} />
}
