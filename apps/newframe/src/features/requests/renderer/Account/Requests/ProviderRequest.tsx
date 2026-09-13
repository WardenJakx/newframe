import { Icon } from '@newframe/ui/icon'
import { Image } from '@newframe/ui/image'
import { Stack } from '@newframe/ui/stack'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'
import { useState, type ReactNode } from 'react'

import { cva } from '../../../../../../generated/styled-system/css/cva.js'
import { persistedImageSource } from '../../../../asset-data/domain/image'
import { RequestStatusNotice } from '../../ui/RequestStatusNotice'
import type { AccessRequestView } from './requestViewTypes'
import { useOriginName, useOrigins } from './state'

const siteIconRecipe = cva({
  base: {
    width: 'field',
    height: 'field',
    display: 'grid',
    placeItems: 'center',
    borderRadius: 'control',
    overflow: 'hidden',
    background: 'bg.control',
    color: 'text.secondary'
  }
})

type ProviderRequestProps = {
  req: AccessRequestView
  originName: string
  favicon: string
  accountSelector?: ReactNode
}

type ProviderRequestWithStateProps = Omit<ProviderRequestProps, 'originName' | 'favicon'>

function ProviderRequest(props: ProviderRequestProps) {
  const [failedFavicon, setFailedFavicon] = useState('')
  const status = props.req.status
  const notice = props.req.notice
  const originName = props.originName
  return (
    <Surface key={props.req.id || props.req.handlerId} padding='large' radius='card' tone='transparent'>
      {notice ? (
        <RequestStatusNotice notice={notice} status={status} />
      ) : (
        <Stack gap='large'>
          <Surface padding='large' tone='transparent'>
            <Stack align='center' gap='medium'>
              <span className={siteIconRecipe()}>
                {props.favicon && failedFavicon !== props.favicon ? (
                  <Image alt='' source={props.favicon} onLoadError={() => setFailedFavicon(props.favicon)} />
                ) : (
                  <Icon name='window' size='large' />
                )}
              </span>
              <Text align='center' truncate variant='heading'>
                {originName}
              </Text>
              <Text align='center' tone='secondary' variant='supporting'>
                wants to connect
              </Text>
            </Stack>
          </Surface>
          {props.req.payload?.method === 'eth_requestAccounts' ? props.accountSelector : null}
        </Stack>
      )}
    </Surface>
  )
}

export default function ProviderRequestWithState(props: ProviderRequestWithStateProps) {
  const originName = useOriginName(props.req.origin)
  const origins = useOrigins()
  return (
    <ProviderRequest
      {...props}
      originName={originName}
      favicon={persistedImageSource(origins[props.req.origin]?.image)}
    />
  )
}
