import { RequestCard } from './RequestCard'
import { Icon, type IconName } from '@newframe/ui/icon'
import { Image } from '@newframe/ui/image'
import { Text } from '@newframe/ui/text'
import { useEffect, useState, type ReactNode } from 'react'

import type { RequestItemRequestView } from '../Account/Requests/requestViewTypes'
import { imageSource } from '../../../asset-data/domain/image'
import type { RequestPanelCapability } from '../requestCapabilities'

type RequestItemProps = {
  panel: Pick<RequestPanelCapability, 'openRequest'>
  req: RequestItemRequestView
  title: string
  svgName?: IconName
  img?: string
  color?: string
  headerMode?: boolean
  children?: ReactNode
  account?: string
  handlerId?: string
  i?: number
}

const getElapsedTime = (req: RequestItemRequestView) => {
  const elapsed = Date.now() - (req.created || 0)
  const secs = Math.floor(elapsed / 1000)
  const mins = Math.floor(secs / 60)
  const hrs = Math.floor(mins / 60)
  const days = Math.floor(hrs / 24)
  if (days >= 1) return `${days}d ago`
  if (hrs >= 1) return `${hrs}h ago`
  if (mins >= 1) return `${mins}m ago`
  if (secs >= 30) return `${secs}s ago`
  return 'NEW'
}

function requestTone(status?: string) {
  if (['sent', 'sending', 'verifying', 'confirming', 'confirmed'].includes(status || ''))
    return 'success' as const
  if (['error', 'declined'].includes(status || '')) return 'danger' as const
  return 'accent' as const
}

function RequestIcon({ img, svgName }: Pick<RequestItemProps, 'img' | 'svgName'>) {
  const source = imageSource(img)
  if (source) return <Image alt='' source={source} />
  return <Icon name={svgName ?? 'ethereum'} size='medium' />
}

export default function RequestItem({
  panel,
  req,
  title,
  svgName,
  img,
  headerMode = false,
  children
}: RequestItemProps) {
  const [ago, setAgo] = useState(() => getElapsedTime(req))

  useEffect(() => {
    const timer = setInterval(() => setAgo(getElapsedTime(req)), 1000)
    return () => clearInterval(timer)
  }, [req])

  const status = (req.status || 'pending').toLowerCase()
  const notice = (req.notice || '').toLowerCase()
  const tone = requestTone(req.status)
  const inactive = ['error', 'declined', 'confirmed'].includes(req.status || '')

  return (
    <RequestCard
      title={title}
      icon={<RequestIcon img={img} svgName={svgName} />}
      status={status}
      tone={tone}
      state={inactive ? (tone === 'danger' ? 'failed' : 'completed') : 'pending'}
      aside={
        <Text tone={ago === 'NEW' ? 'accent' : 'muted'} variant='caption' shrink={false}>
          {ago}
        </Text>
      }
      notice={
        notice && notice !== status ? (
          <Text tone={notice === 'see signer' ? 'accent' : tone} variant='caption'>
            {notice}
          </Text>
        ) : undefined
      }
      headerMode={headerMode}
      onOpen={() => void panel.openRequest({ requestId: req.handlerId })}
    >
      {children}
    </RequestCard>
  )
}
