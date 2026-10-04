import { Stack } from '@newframe/ui/stack'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'

import { cva } from '../../../../../../generated/styled-system/css/cva.js'
import { AddChainDetails } from '../../../../shared/ui/AddChainDetails.tsx'
import { RequestStatusNotice } from '../../ui/RequestStatusNotice.tsx'
import type { ChainRequestView } from './requestViewTypes.ts'
import { useChain, useOriginName } from './state.ts'

type ChainRequestProps = {
  req: ChainRequestView
  originName: string
  chainName?: string
}

type ChainRequestWithStateProps = Omit<ChainRequestProps, 'originName' | 'chainName'>

const detailsRecipe = cva({ base: { paddingInline: '6', paddingBlockEnd: '9' } })

function ChainRequest(props: ChainRequestProps) {
  const { status, notice, type, chain } = props.req

  const { originName, chainName } = props
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
          {chainName}
        </Text>
      </Stack>
    </Surface>
  )
}

export default function ChainRequestWithState(props: ChainRequestWithStateProps) {
  const { req } = props
  const originName = useOriginName(req.origin)
  const chain = useChain(req.chain.type, Number(req.chain.id))
  return <ChainRequest {...props} originName={originName} chainName={chain.name ?? ''} />
}
