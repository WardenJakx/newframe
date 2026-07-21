import type { ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { ScrollArea } from '@newframe/ui/scroll-area'
import { Stack } from '@newframe/ui/stack'
import link from '../../../resources/link'
import { cva } from '../../../resources/styled-system/css/cva.js'
import { SidePanelHeader } from '../../../resources/Components/SidePanel/SidePanelHeader'

import Requests from './Requests'
import ProviderRequest from './Requests/ProviderRequest'
import TransactionRequest from './Requests/TransactionRequest'
import SignatureRequest from './Requests/SignatureRequest'
import ChainRequest from './Requests/ChainRequest'
import AddTokenRequest from './Requests/AddTokenRequest'
import SignTypedDataRequest from './Requests/SignTypedDataRequest'
import SignPermitRequest from './Requests/SignPermitRequest'
import { isHardwareSigner } from '../../../resources/domain/signer'
import { persistedImageSource } from '../../../resources/domain/image'
import { accountViewTitles } from '../../../resources/domain/request'
import { useWalletSelector } from '../../state/useAppSelector'
import type { TrayRendererState } from '../state'
import { useRequestView } from '../requestView'

const requestComponents: Record<string, any> = {
  sign: SignatureRequest,
  signTypedData: SignTypedDataRequest,
  signErc20Permit: SignPermitRequest,
  transaction: TransactionRequest,
  access: ProviderRequest,
  addChain: ChainRequest,
  addToken: AddTokenRequest
}

const accountViewRecipe = cva({
  base: {
    position: 'absolute',
    insetBlockStart: '2',
    insetInline: '2',
    insetBlockEnd: 'var(--tray-footer-height, token(sizes.panel-footer))',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    borderRadius: 'card',
    background: 'bg.primary'
  }
})

const accountMainRecipe = cva({ base: { minHeight: 0, flex: 1, overflow: 'hidden' } })

interface AccountViewProps {
  accountViewIcon?: ReactNode
  accountViewTitle?: string
  back(): void
  children: ReactNode
}

function AccountView({ accountViewIcon, accountViewTitle, back, children }: AccountViewProps) {
  return (
    <div className={accountViewRecipe()}>
      <SidePanelHeader
        closeLabel='Back'
        onClose={back}
        title={accountViewTitle || ''}
        titleLeading={accountViewIcon}
      />
      <div className={accountMainRecipe()}>
        <ScrollArea height='fill'>{children}</ScrollArea>
      </div>
    </div>
  )
}

interface AccountBodyProps {
  accountViewIcon?: ReactNode
  addresses?: unknown[]
  id: string
  minimized?: boolean
  signer?: string
  status?: string
}

function AccountBody(props: AccountBodyProps) {
  const requestView = useRequestView()
  const { accounts, crumb, networks, networksMeta, origins } = useWalletSelector(
    useShallow((state: TrayRendererState) => ({
      accounts: state.accounts,
      crumb: state.windows.panel.nav[0],
      networks: state.networks.ethereum,
      networksMeta: state.networksMeta.ethereum,
      origins: state.origins
    }))
  )
  const back = () => {
    if (!requestView.back()) void link.executeCommand({ type: 'panel.back', steps: 1 })
  }

  const renderRequest = (request: any) => {
    const Request = requestComponents[request.type]
    if (!Request) return null

    const account = accounts[props.id]
    const chainId = request.type === 'signErc20Permit' ? request.typedMessage.data.domain.chainId : undefined
    const metadata = chainId === undefined ? undefined : networksMeta[chainId]
    const chainData =
      chainId === undefined
        ? {}
        : {
            chainId,
            chainName: networks[chainId]?.name,
            chainColor: metadata?.primaryColor,
            icon: persistedImageSource(metadata?.image)
          }
    const signingDelay = isHardwareSigner(account?.lastSignerType) ? 200 : 1500

    return (
      <Request
        key={request.handlerId}
        req={request}
        step={requestView.step}
        stepData={requestView}
        signingDelay={signingDelay}
        chainId={chainData.chainId}
        originName={origins[request.origin]?.name || ''}
        chainData={chainData}
      />
    )
  }

  if (crumb?.view === 'requestView') {
    const { accountId, requestId } = crumb.data
    const request = accountId && requestId ? accounts[accountId]?.requests[requestId] : undefined
    const accountViewTitle = request ? (accountViewTitles as any)[request.type] || '' : ''

    return (
      <AccountView back={back} accountViewIcon={props.accountViewIcon} accountViewTitle={accountViewTitle}>
        {request && renderRequest(request)}
      </AccountView>
    )
  }

  if (crumb?.view === 'expandedModule' && crumb.data?.id === 'requests') {
    return (
      <AccountView back={back} accountViewIcon={props.accountViewIcon} accountViewTitle={crumb.data.id}>
        <Stack grow>
          <div onMouseDown={(event) => event.stopPropagation()}>
            <Requests expanded={true} account={crumb.data.account} moduleId='requests' />
          </div>
        </Stack>
      </AccountView>
    )
  }

  return null
}

interface AccountProps extends Omit<AccountBodyProps, 'minimized'> {
  [key: string]: unknown
}

export default function Account(props: AccountProps) {
  const minimized = useWalletSelector((state: TrayRendererState) => state.selected.minimized)

  return <AccountBody {...props} minimized={minimized} />
}
