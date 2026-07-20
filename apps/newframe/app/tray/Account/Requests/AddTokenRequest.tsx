import { Stack } from '@newframe/ui/stack'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'

import { RequestStatusNotice } from '../../../../resources/Components/RequestStatusNotice'
import { useOriginName } from './state'
import type { AddTokenRequest as AddTokenAccountRequest } from '../../../../main/accounts/types'

type AddTokenRequestProps = {
  req: AddTokenAccountRequest & { id?: string }
  originName: string
  pos?: number
}

type AddTokenRequestWithStateProps = Omit<AddTokenRequestProps, 'originName'>

export function AddTokenRequest(props: AddTokenRequestProps) {
  const status = props.req.status
  const notice = props.req.notice

  const originName = props.originName
  const token = props.req.token
  return (
    <Surface key={props.req.id || props.req.handlerId} padding='large' radius='card'>
      {notice ? (
        <RequestStatusNotice notice={notice} status={status} />
      ) : (
        <Stack align='center' gap='medium'>
          <Text align='center' variant='sectionTitle'>
            Add Token
          </Text>
          <Stack align='center' gap='xsmall'>
            <Text align='center' truncate variant='heading'>
              {originName}
            </Text>
            <Text align='center' tone='secondary' variant='supporting'>
              wants to add a token
            </Text>
          </Stack>
          <Surface border='subtle' padding='small' radius='control' tone='raised'>
            <Stack align='center' gap='xsmall'>
              <Text variant='heading'>{token.symbol.toUpperCase()}</Text>
              <Text tone='secondary' variant='label'>
                {token.name}
              </Text>
              <Text tone='muted' truncate variant='code'>
                {token.address}
              </Text>
            </Stack>
          </Surface>
        </Stack>
      )}
    </Surface>
  )
}

export default function AddTokenRequestWithState(props: AddTokenRequestWithStateProps) {
  const originName = useOriginName(props.req.origin)
  return <AddTokenRequest {...props} originName={originName} />
}
