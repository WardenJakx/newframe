import { Stack } from '@newframe/ui/stack'
import { Surface } from '@newframe/ui/surface'
import type { ReactNode } from 'react'

import { persistedImageSource } from '../../../../asset-data/domain/image/index.ts'
import { RequestOrigin } from '../../ui/RequestOrigin.tsx'
import { RequestStatusNotice } from '../../ui/RequestStatusNotice.tsx'
import type { AccessRequestView } from './requestViewTypes.ts'
import { useOriginName, useOrigins } from './state.ts'

type ProviderRequestProps = {
  req: AccessRequestView
  originName: string
  favicon: string
  accountSelector?: ReactNode
}

type ProviderRequestWithStateProps = Omit<ProviderRequestProps, 'originName' | 'favicon'>

function ProviderRequest(props: ProviderRequestProps) {
  const status = props.req.status
  const notice = props.req.notice
  const originName = props.originName
  return (
    <Surface key={props.req.id ?? props.req.requestId} padding='large' radius='card' tone='transparent'>
      {notice ? (
        <RequestStatusNotice notice={notice} status={status} />
      ) : (
        <Stack gap='large'>
          <Surface padding='large' tone='transparent'>
            <RequestOrigin originName={originName} favicon={props.favicon} description='wants to connect' />
          </Surface>
          {props.req.payload.method === 'eth_requestAccounts' ? props.accountSelector : null}
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
