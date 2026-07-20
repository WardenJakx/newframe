import { Stack } from '@newframe/ui/stack'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'

import { RequestStatusNotice } from '../../../../../resources/Components/RequestStatusNotice'
import { useNetwork, useOriginName } from '../state'
import type { AccountRequest } from '../../../../../main/accounts/types'

type ChainRequestData = AccountRequest<'addChain' | 'switchChain'> & {
  id?: string
  chain: {
    id: string | number
    type: string
    name?: string
  }
}

type ChainRequestProps = {
  req: ChainRequestData
  originName: string
  networkName?: string
}

type ChainRequestWithStateProps = Omit<ChainRequestProps, 'originName' | 'networkName'>

export function ChainRequest(props: ChainRequestProps) {
  const { status, notice, type, chain } = props.req

  const { originName, networkName } = props
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
            {type === 'switchChain' ? 'wants to switch to chain' : 'wants to add chain'}
          </Text>
          <Text align='center' tone='accent' variant='sectionTitle'>
            {type === 'switchChain' ? networkName : chain.name || ''}
          </Text>
        </Stack>
      )}
    </Surface>
  )
}

export default function ChainRequestWithState(props: ChainRequestWithStateProps) {
  const { req } = props
  const originName = useOriginName(req.origin)
  const network = useNetwork(req.chain.type, Number(req.chain.id))
  return <ChainRequest {...props} originName={originName} networkName={network.name || ''} />
}
