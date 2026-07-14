import type { ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'

import svg from '../../../resources/svg'
import link from '../../../resources/link'

import Requests from './Requests'
import ProviderRequest from './Requests/ProviderRequest'
import TransactionRequest from './Requests/TransactionRequest'
import SignatureRequest from './Requests/SignatureRequest'
import ChainRequest from './Requests/ChainRequest'
import AddTokenRequest from './Requests/AddTokenRequest'
import SignTypedDataRequest from './Requests/SignTypedDataRequest'
import SignPermitRequest from './Requests/SignPermitRequest'
import { isHardwareSigner } from '../../../resources/domain/signer'
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

interface AccountViewProps {
  accountViewIcon?: ReactNode
  accountViewTitle?: string
  back(): void
  children: ReactNode
}

function AccountView({ accountViewIcon, accountViewTitle, back, children }: AccountViewProps) {
  const accountOpen = useWalletSelector((state: TrayRendererState) => state.selected.open)

  return (
    <div className='accountView' style={{ top: accountOpen ? '140px' : '80px' }}>
      <div className='accountViewMenu cardShow'>
        <div className='accountViewBack' onClick={back}>
          {svg.chevronLeft(16)}
        </div>
        <div className='accountViewTitle'>
          <div className='accountViewIcon'>{accountViewIcon}</div>
          <div className='accountViewText'>{accountViewTitle}</div>
        </div>
      </div>
      <div className='accountViewMain cardShow'>{children}</div>
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
            icon: metadata?.icon
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
        <div className='accountsModuleExpand cardShow'>
          <div className='moduleExpanded' onMouseDown={(event) => event.stopPropagation()}>
            <Requests expanded={true} account={crumb.data.account} moduleId='requests' />
          </div>
        </div>
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
