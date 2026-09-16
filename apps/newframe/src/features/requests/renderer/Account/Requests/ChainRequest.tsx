import { Stack } from '@newframe/ui/stack'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'

import { cva } from '../../../../../../generated/styled-system/css/cva.js'
import { AddChainDetails } from '../../../../../shared/renderer/ui/AddChainDetails'
import { RequestStatusNotice } from '../../ui/RequestStatusNotice'
import type { ChainRequestView } from './requestViewTypes'
import { useNetwork, useOriginName } from './state'

type ChainRequestProps = {
  req: ChainRequestView
  originName: string
  networkName?: string
}

type ChainRequestWithStateProps = Omit<ChainRequestProps, 'originName' | 'networkName'>

const detailsRecipe = cva({ base: { paddingInline: '6', paddingBlockEnd: '9' } })

function ChainRequest(props: ChainRequestProps) {
  const { status, notice, type, chain } = props.req

  const { originName, networkName } = props
  if (notice) {
    return (
      <Surface key={props.req.id ?? props.req.handlerId} padding='large' radius='card'>
        <RequestStatusNotice notice={notice} status={status} />
      </Surface>
    )
  }

  if (type === 'addChain') {
    return (
      <div className={detailsRecipe()}>
        <AddChainDetails chain={chain} description={`${originName} wants to add this chain.`} />
      </div>
    )
  }

  return (
    <Surface key={props.req.id ?? props.req.handlerId} padding='large' radius='card'>
      <Stack align='center' gap='small'>
        <Text align='center' truncate variant='heading'>
          {originName}
        </Text>
        <Text align='center' tone='secondary' variant='supporting'>
          wants to switch to chain
        </Text>
        <Text align='center' tone='accent' variant='sectionTitle'>
          {networkName}
        </Text>
      </Stack>
    </Surface>
  )
}

export default function ChainRequestWithState(props: ChainRequestWithStateProps) {
  const { req } = props
  const originName = useOriginName(req.origin)
  const network = useNetwork(req.chain.type, Number(req.chain.id))
  return <ChainRequest {...props} originName={originName} networkName={network.name ?? ''} />
}
