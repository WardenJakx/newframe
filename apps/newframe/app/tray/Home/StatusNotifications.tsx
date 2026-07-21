import React, { useEffect } from 'react'

import { IconButton } from '@newframe/ui/icon-button'
import { Stack } from '@newframe/ui/stack'
import { Text } from '@newframe/ui/text'

import StatusGlyph from '../../../resources/Components/StatusGlyph'
import { cva } from '../../../resources/styled-system/css/cva.js'

const notificationListRecipe = cva({
  base: {
    position: 'relative',
    zIndex: 'content',
    display: 'flex',
    flexDirection: 'column',
    gap: '3',
    paddingBlockStart: '4',
    paddingInline: '6',
    pointerEvents: 'none'
  }
})

const notificationRecipe = cva({
  base: {
    display: 'grid',
    minHeight: 'list-row',
    gridTemplateColumns: '28px 22px minmax(0, 1fr) auto 24px',
    alignItems: 'center',
    gap: '4',
    padding: '4',
    borderWidth: 'thin',
    borderStyle: 'solid',
    borderRadius: 'small',
    background: 'bg.primary',
    boxShadow: 'elevation-raised',
    pointerEvents: 'auto',
    cursor: 'pointer',
    _hover: { background: 'bg.card' }
  },
  variants: {
    state: {
      completed: { borderColor: 'action.primary.border' },
      failed: { borderColor: 'action.danger.border' },
      pending: { borderColor: 'border' }
    }
  },
  defaultVariants: { state: 'pending' }
})

const chainRecipe = cva({
  base: {
    display: 'grid',
    width: 'icon-large',
    height: 'icon-large',
    placeItems: 'center',
    color: 'text.secondary'
  }
})

const PENDING_NOTIFICATION_MS = 60 * 1000
const RESOLVED_NOTIFICATION_MS = 3000

type StatusNotification = {
  id: string
  state?: string
  title?: string
  detail?: string
  hidden?: boolean
  createdAt?: unknown
  updatedAt?: unknown
  expiresAt?: unknown
  leadingIcon?: { chainId?: string | number }
  target?: { chainId?: string | number; hash?: string; [key: string]: unknown }
  metadata?: { hash?: string }
}

export const timestamp = (value: any, fallback = 0) => {
  if (typeof value === 'number') return value
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) return parsed
    const numeric = Number(value)
    if (!Number.isNaN(numeric)) return numeric
  }
  return fallback
}

const notificationExpiresAt = (notification: StatusNotification) => {
  const fallbackBase = timestamp(notification.updatedAt, timestamp(notification.createdAt, Date.now()))
  const fallbackDuration =
    notification.state === 'pending' ? PENDING_NOTIFICATION_MS : RESOLVED_NOTIFICATION_MS
  return timestamp(notification.expiresAt, fallbackBase + fallbackDuration)
}

const notificationLabel = (state?: string) => {
  if (state === 'completed') return 'Confirmed'
  if (state === 'failed') return 'Failed'
  return 'Pending'
}

const shortHash = (hash?: string) => {
  if (!hash) return ''
  return `${hash.substring(0, 6)}...${hash.substring(hash.length - 4)}`
}

const notificationMetadata = (notification: StatusNotification, label: string) => {
  const detail = String(notification.detail || '').trim()
  if (detail && detail.toLowerCase() !== label.toLowerCase()) return detail
  return shortHash(notification.target?.hash || notification.metadata?.hash)
}

const notificationTimestamp = (notification: StatusNotification) => {
  const shownAt = timestamp(notification.createdAt, timestamp(notification.updatedAt, 0))
  if (!shownAt) return ''

  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3
  }).format(new Date(shownAt))
}

interface StatusNotificationsProps {
  notifications: Record<string, StatusNotification>
  renderChainIcon: (notification: StatusNotification) => React.ReactNode
  onDismiss: (id: string) => void
  onExpire: (id: string) => void
  onOpen: (notification: StatusNotification) => void
}

export default function StatusNotifications({
  notifications,
  renderChainIcon,
  onDismiss,
  onExpire,
  onOpen
}: StatusNotificationsProps) {
  const entries = Object.values(notifications || {})

  useEffect(() => {
    const timers = Object.values(notifications || {}).map((notification) => {
      const wait = Math.max(0, notificationExpiresAt(notification) - Date.now())
      return setTimeout(() => onExpire(notification.id), wait)
    })
    return () => timers.forEach((timer) => clearTimeout(timer))
  }, [notifications, onExpire])

  const visible = entries
    .filter((notification) => notification?.id && !notification.hidden)
    .sort(
      (a, b) =>
        timestamp(b.createdAt, timestamp(b.updatedAt, 0)) - timestamp(a.createdAt, timestamp(a.updatedAt, 0))
    )
    .slice(0, 3)

  if (!visible.length) return null

  return (
    <section aria-label='Status notifications' className={notificationListRecipe()}>
      {visible.map((notification) => {
        const state = notification.state || 'pending'
        const label = notificationLabel(state)
        const metadata = notificationMetadata(notification, label)
        const shownAt = notificationTimestamp(notification)

        return (
          <div
            key={notification.id}
            aria-label={`${label} ${notification.title || ''}`}
            className={notificationRecipe({ state: state as 'completed' | 'failed' | 'pending' })}
            onClick={() => onOpen(notification)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onOpen(notification)
              }
            }}
            role='button'
            tabIndex={0}
          >
            <StatusGlyph
              state={state === 'completed' ? 'completed' : state === 'failed' ? 'failed' : 'pending'}
            />
            <span className={chainRecipe()}>{renderChainIcon(notification)}</span>
            <Stack gap='xsmall' grow>
              <Stack direction='row' gap='xsmall'>
                <Text shrink={false} tone='secondary' variant='label'>
                  {label}
                </Text>
                <Text tone='secondary' truncate variant='supporting'>
                  {notification.title}
                </Text>
              </Stack>
              {metadata ? (
                <Text tone='muted' truncate variant='code'>
                  {metadata}
                </Text>
              ) : null}
            </Stack>
            {shownAt ? (
              <Text shrink={false} tone='muted' variant='microCode'>
                {shownAt}
              </Text>
            ) : null}
            <IconButton
              icon='close'
              label='Dismiss notification'
              onPress={(event) => {
                event.stopPropagation()
                onDismiss(notification.id)
              }}
              size='small'
            />
          </div>
        )
      })}
    </section>
  )
}
