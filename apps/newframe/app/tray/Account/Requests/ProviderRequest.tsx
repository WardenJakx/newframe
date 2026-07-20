import { Stack } from '@newframe/ui/stack'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'

import { RequestStatusNotice } from '../../../../resources/Components/RequestStatusNotice'
import { useOriginName } from './state'
import type { AccessRequest } from '../../../../main/accounts/types'

type ProviderRequestProps = {
  req: AccessRequest & { id?: string }
  originName: string
}

type ProviderRequestWithStateProps = Omit<ProviderRequestProps, 'originName'>

export function ProviderRequest(props: ProviderRequestProps) {
  const status = props.req.status
  const notice = props.req.notice
  const originName = props.originName
  return (
    <Surface key={props.req.id || props.req.handlerId} padding='large' radius='card'>
      {notice ? (
        <RequestStatusNotice notice={notice} status={status} />
      ) : (
        <Stack align='center' gap='small'>
          <Text align='center' truncate variant='heading'>
            {originName}
          </Text>
          <Text align='center' tone='secondary' variant='supporting'>
            wants to connect
          </Text>
        </Stack>
      )}
    </Surface>
  )
}

export default function ProviderRequestWithState(props: ProviderRequestWithStateProps) {
  const originName = useOriginName(props.req.origin)
  return <ProviderRequest {...props} originName={originName} />
}
