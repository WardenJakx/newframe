import { Button } from '@newframe/ui/button'
import { Icon } from '@newframe/ui/icon'
import { Inline } from '@newframe/ui/inline'
import { ScrollArea } from '@newframe/ui/scroll-area'
import { Stack } from '@newframe/ui/stack'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'
import type { ReactNode } from 'react'

import type {
  AccessRequest,
  AgentAccessRequest,
  AccountRequest,
  AddChainRequest,
  AddTokenRequest,
  SignatureRequest,
  TransactionRequest
} from '../../../../main/accounts/types'
import RequestItem from '../../../../resources/Components/RequestItem'
import { persistedImageSource } from '../../../../resources/domain/image'
import link from '../../../../resources/link'
import { cva } from '../../../../resources/styled-system/css/cva.js'
import TxOverview from './TransactionRequest/TxMainNew/overview'
import { useAccountRequests, useEthereumNetworkMetadata, useEthereumNetworks, useOrigins } from './state'

type RenderableRequest =
  | AccessRequest
  | AgentAccessRequest
  | AddChainRequest
  | AddTokenRequest
  | SignatureRequest
  | TransactionRequest
  | AccountRequest<'switchChain'>

type RequestsWithStateProps = { account?: string; expanded?: boolean; moduleId?: string }

type RequestsProps = RequestsWithStateProps & {
  accountRequests: Record<string, RenderableRequest>
  networks: ReturnType<typeof useEthereumNetworks>
  networkMetadata: ReturnType<typeof useEthereumNetworkMetadata>
  origins: ReturnType<typeof useOrigins>
}

const requestsRecipe = cva({ base: { width: '100%', paddingBlockStart: '10' } })

export function Requests(props: RequestsProps) {
  const requestCard = (req: RenderableRequest, index: number) => {
    let title = 'Request'
    let svgName: string | undefined
    let img: string | undefined
    let detail: ReactNode

    if (req.type === 'agentAccess') {
      title = 'Agent Access'
      svgName = 'sign'
    } else if (req.type === 'access') {
      title = 'Account Access'
      svgName = 'accounts'
    } else if (req.type === 'sign') {
      title = 'Sign Message'
      svgName = 'sign'
    } else if (req.type === 'signTypedData') {
      title = 'Sign Data'
      svgName = 'sign'
    } else if (req.type === 'signErc20Permit') {
      const chainId = req.typedMessage.data.domain.chainId
      title = `${props.networks[chainId]?.name || 'Network'} Token Permit`
      img = persistedImageSource(props.networkMetadata[chainId]?.image)
    } else if (req.type === 'addChain') {
      title = 'Add Chain'
      svgName = 'chain'
    } else if (req.type === 'switchChain') {
      title = 'Switch Chain'
      svgName = 'chain'
    } else if (req.type === 'addToken') {
      title = 'Add Tokens'
      svgName = 'tokens'
    } else if (req.type === 'transaction') {
      const chainId = parseInt(req.data.chainId, 16)
      const chainName = props.networks[chainId]?.name
      const metadata = props.networkMetadata[chainId]
      const currentSymbol = metadata?.nativeCurrency?.symbol || '?'
      title = `${chainName || 'Network'} Transaction`
      img = persistedImageSource(metadata?.image)
      detail = (
        <TxOverview
          chainColor={metadata?.primaryColor}
          chainName={chainName}
          originName={props.origins[req.origin]?.name || req.origin}
          req={req}
          simple
          symbol={currentSymbol}
        />
      )
    }

    return (
      <RequestItem img={img} key={`${req.type}-${index}`} req={req} svgName={svgName} title={title}>
        {detail}
      </RequestItem>
    )
  }

  const requests = Object.values(props.accountRequests).sort((a, b) => (b.created || 0) - (a.created || 0))
  const originSortedRequests = requests.reduce<Record<string, RenderableRequest[]>>((groups, request) => {
    groups[request.origin] = groups[request.origin] || []
    groups[request.origin].push(request)
    return groups
  }, {})
  const groups = Object.entries(originSortedRequests)

  return (
    <div className={requestsRecipe()}>
      <ScrollArea height='page'>
        {groups.length === 0 ? (
          <Surface border='subtle' padding='large' radius='card' tone='card'>
            <Text align='center' tone='secondary' variant='overline'>
              No pending requests
            </Text>
          </Surface>
        ) : (
          <Stack gap='medium'>
            {groups.map(([origin, originRequests]) => (
              <Surface border='subtle' key={origin} padding='small' radius='card' tone='card'>
                <Stack gap='small'>
                  <Inline align='center' gap='small' justify='between'>
                    <Inline align='center' gap='small'>
                      <Icon name='window' size='small' tone='accent' />
                      <Text variant='label' truncate>
                        {props.origins[origin]?.name || origin}
                      </Text>
                    </Inline>
                    <Button
                      appearance='ghost'
                      onPress={() =>
                        void link.executeCommand({
                          type: 'request.clear-origin',
                          accountId: props.account || '',
                          originId: origin
                        })
                      }
                      size='small'
                      tone='danger'
                    >
                      <Icon name='close' size='small' />
                      <Text variant='caption'>Clear all</Text>
                    </Button>
                  </Inline>
                  <Stack gap='small'>{originRequests.map(requestCard)}</Stack>
                </Stack>
              </Surface>
            ))}
          </Stack>
        )}
      </ScrollArea>
    </div>
  )
}

export default function RequestsWithState(props: RequestsWithStateProps) {
  const accountRequests = useAccountRequests(props.account || '') as unknown as Record<
    string,
    RenderableRequest
  >
  return (
    <Requests
      {...props}
      accountRequests={accountRequests}
      networkMetadata={useEthereumNetworkMetadata()}
      networks={useEthereumNetworks()}
      origins={useOrigins()}
    />
  )
}
