import { Button } from '@newframe/ui/button'
import { Image } from '@newframe/ui/image'
import { Inline } from '@newframe/ui/inline'
import { Stack } from '@newframe/ui/stack'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'
import { useEffect, useState, type ReactNode } from 'react'

import type { AccountRequest } from '../../../main/accounts/types'
import { cachedImageUrl } from '../../domain/imageCache'
import link from '../../link'
import svg from '../../svg'
import { cva } from '../../styled-system/css/cva.js'
import StatusGlyph from '../StatusGlyph'

type RequestItemProps = {
  req: AccountRequest
  title: string
  svgName?: string
  img?: string
  color?: string
  headerMode?: boolean
  children?: ReactNode
  account?: string
  handlerId?: string
  i?: number
}

const iconRecipe = cva({
  base: {
    display: 'grid',
    width: 'icon-button-medium',
    height: 'icon-button-medium',
    flex: 'none',
    placeItems: 'center',
    overflow: 'hidden',
    borderWidth: 'thin',
    borderStyle: 'solid',
    borderColor: 'border',
    borderRadius: 'pill',
    background: 'bg.control',
    color: 'action.primary'
  }
})

const contentRecipe = cva({ base: { width: '100%', minWidth: 0 } })

const getElapsedTime = (req: AccountRequest) => {
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
  if (img) return <Image alt='' source={cachedImageUrl(img)} />
  const icon = svgName
    ? (svg as unknown as Record<string, ((size: number) => ReactNode) | undefined>)[svgName.toLowerCase()]
    : undefined
  return <>{icon ? icon(16) : svg.eth(16)}</>
}

export default function RequestItem({
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

  const content = (
    <div className={contentRecipe()}>
      <Stack gap='small'>
        <Inline align='center' gap='small'>
          <span className={iconRecipe()}>
            <RequestIcon img={img} svgName={svgName} />
          </span>
          <Stack gap='xsmall' grow>
            <Text variant='label' truncate>
              {title}
            </Text>
            <Inline align='center' gap='xsmall'>
              <StatusGlyph
                size='small'
                state={inactive ? (tone === 'danger' ? 'failed' : 'completed') : 'pending'}
              />
              <Text tone={tone} variant='caption'>
                {status}
              </Text>
            </Inline>
          </Stack>
          <Text tone={ago === 'NEW' ? 'accent' : 'muted'} variant='caption' shrink={false}>
            {ago}
          </Text>
        </Inline>
        {children}
        {notice && notice !== status ? (
          <div role='alert'>
            <Text tone={notice === 'see signer' ? 'accent' : tone} variant='caption'>
              {notice}
            </Text>
          </div>
        ) : null}
      </Stack>
    </div>
  )

  if (headerMode) {
    return (
      <Surface border='subtle' padding='small' radius='card' tone='card'>
        {content}
      </Surface>
    )
  }

  return (
    <Button
      appearance='outlinedSelection'
      label={`Open ${title}`}
      onPress={() => void link.executeCommand({ type: 'panel.request-open', requestId: req.handlerId })}
      size='list'
      width='full'
    >
      {content}
    </Button>
  )
}
