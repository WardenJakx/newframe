import React, { useEffect } from 'react'

import StatusGlyph from '../../../resources/Components/StatusGlyph'
import svg from '../../../resources/svg'

const PENDING_NOTIFICATION_MS = 60 * 1000
const RESOLVED_NOTIFICATION_MS = 3000

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

const notificationExpiresAt = (notification: any) => {
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

const notificationMetadata = (notification: any, label: string) => {
  const detail = String(notification.detail || '').trim()
  if (detail && detail.toLowerCase() !== label.toLowerCase()) return detail
  return shortHash(notification.target?.hash || notification.metadata?.hash)
}

const notificationTimestamp = (notification: any) => {
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
  notifications: Record<string, any>
  renderChainIcon: (notification: any) => React.ReactNode
  onDismiss: (id: string) => void
  onExpire: (id: string) => void
  onOpen: (notification: any) => void
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
    const timers = entries.map((notification: any) => {
      const wait = Math.max(0, notificationExpiresAt(notification) - Date.now())
      return setTimeout(() => onExpire(notification.id), wait)
    })
    return () => timers.forEach((timer) => clearTimeout(timer))
  }, [notifications, onExpire])

  const now = Date.now()
  const visible = entries
    .filter((notification: any) => notification?.id && !notification.hidden)
    .filter((notification: any) => notificationExpiresAt(notification) > now)
    .sort(
      (a: any, b: any) =>
        timestamp(b.createdAt, timestamp(b.updatedAt, 0)) - timestamp(a.createdAt, timestamp(a.updatedAt, 0))
    )
    .slice(0, 3)

  if (!visible.length) return null

  return (
    <div aria-label='Status notifications' className='t2StatusNotifications'>
      {visible.map((notification: any) => {
        const state = notification.state || 'pending'
        const label = notificationLabel(state)
        const metadata = notificationMetadata(notification, label)
        const shownAt = notificationTimestamp(notification)

        return (
          <div
            key={notification.id}
            aria-label={`${label} ${notification.title || ''}`}
            className={`t2StatusNotification t2StatusNotification-${state}`}
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
            <div className='t2StatusNotificationChain'>{renderChainIcon(notification)}</div>
            <div className='t2StatusNotificationCopy'>
              <div className='t2StatusNotificationTopline'>
                <span>{label}</span>
                <span>{notification.title}</span>
              </div>
              {metadata ? <div className='t2StatusNotificationDetail'>{metadata}</div> : null}
            </div>
            {shownAt ? <div className='t2StatusNotificationTimestamp'>{shownAt}</div> : null}
            <div
              aria-label='Dismiss notification'
              className='t2StatusNotificationDismiss'
              onClick={(e) => {
                e.stopPropagation()
                onDismiss(notification.id)
              }}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onDismiss(notification.id)
                }
              }}
              role='button'
              tabIndex={0}
            >
              {svg.x(9)}
            </div>
          </div>
        )
      })}
    </div>
  )
}
