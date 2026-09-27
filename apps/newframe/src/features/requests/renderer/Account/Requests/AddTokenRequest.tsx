import { Image } from '@newframe/ui/image'
import { MediaBadge } from '@newframe/ui/media-badge'
import { Stack } from '@newframe/ui/stack'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'

import { AddressIdentity } from '../../../../../shared/renderer/ui/AddressIdentity'
import { accountDisplayType } from '../../../../../shared/renderer/ui/signerPresentation'
import { persistedImageSource } from '../../../../asset-data/domain/image'
import { RequestStatusNotice } from '../../ui/RequestStatusNotice'
import type { AddTokenRequestView } from './requestViewTypes'
import { useAccountIdentity, useOriginName } from './state'

type AddTokenRequestProps = {
  req: AddTokenRequestView
  originName: string
  accountType?: string
  pos?: number
}

type AddTokenRequestWithStateProps = Omit<AddTokenRequestProps, 'originName'>

function AddTokenRequest(props: AddTokenRequestProps) {
  const status = props.req.status
  const notice = props.req.notice

  const originName = props.originName
  const token = props.req.token
  const image = persistedImageSource(token.image)
  return (
    <Surface key={props.req.id ?? props.req.handlerId} padding='large' radius='card'>
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
              <MediaBadge decorative size='medium'>
                {image ? (
                  <Image alt='' source={image} />
                ) : (
                  <Text variant='detail'>{token.symbol.slice(0, 3)}</Text>
                )}
              </MediaBadge>
              <Text variant='heading'>{token.symbol.toUpperCase()}</Text>
              <Text tone='secondary' variant='label'>
                {token.name}
              </Text>
              <Text tone='secondary' variant='label'>
                Chain {token.chainId} · {token.decimals} decimals
              </Text>
              <AddressIdentity address={token.address} accountType={props.accountType} />
              {props.req.warning ? (
                <Text align='center' tone='warning' variant='supporting'>
                  {props.req.warning}
                </Text>
              ) : null}
            </Stack>
          </Surface>
        </Stack>
      )}
    </Surface>
  )
}

export default function AddTokenRequestWithState(props: AddTokenRequestWithStateProps) {
  const originName = useOriginName(props.req.origin)
  const accountType = accountDisplayType(useAccountIdentity(props.req.token.address))
  return <AddTokenRequest {...props} originName={originName} accountType={accountType} />
}
