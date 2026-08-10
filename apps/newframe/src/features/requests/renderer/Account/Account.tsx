import type { ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { ScrollArea } from '@newframe/ui/scroll-area'
import { Stack } from '@newframe/ui/stack'
import { cva } from '../../../../../generated/styled-system/css/cva.js'
import { SidePanelHeader } from '../../../../shared/renderer/ui/SidePanel/SidePanelHeader'

import Requests from './Requests'
import ProviderRequest from './Requests/ProviderRequest'
import TransactionRequest from './Requests/TransactionRequest'
import SignatureRequest from './Requests/SignatureRequest'
import ChainRequest from './Requests/ChainRequest'
import AddTokenRequest from './Requests/AddTokenRequest'
import SignTypedDataRequest from './Requests/SignTypedDataRequest'
import SignPermitRequest from './Requests/SignPermitRequest'
import AgentAccessRequest from './Requests/AgentAccessRequest'
import { persistedImageSource } from '../../../asset-data/domain/image'
import { accountViewTitles } from '../../domain'
import { useWalletSelector } from '../../../../platform/state-sync/renderer/useAppSelector'
import type { WalletRendererState } from '../../../../platform/state-sync/contract/projections'
import { useRequestView } from '../requestView'
import type { RequestRendererCapabilities } from '../requestCapabilities'
import type {
  RenderableRequestView,
  TransactionDataView,
  TransactionRequestView
} from './Requests/requestViewTypes'

type ProjectedRequest = WalletRendererState['accounts'][string]['requests'][string]

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isIdentity = (value: unknown) =>
  isRecord(value) &&
  typeof value.address === 'string' &&
  typeof value.ens === 'string' &&
  typeof value.type === 'string'

const isOptionalString = (value: unknown) => value === undefined || typeof value === 'string'
const isStringOrNumber = (value: unknown) => typeof value === 'string' || typeof value === 'number'

const isRpcPayload = (value: unknown) =>
  isRecord(value) &&
  isStringOrNumber(value.id) &&
  value.jsonrpc === '2.0' &&
  typeof value.method === 'string' &&
  typeof value._origin === 'string' &&
  Array.isArray(value.params)

const isRequestBase = (request: ProjectedRequest) =>
  typeof request.origin === 'string' && typeof request.account === 'string' && isRpcPayload(request.payload)

const isDigests = (value: unknown) =>
  value === undefined ||
  (isRecord(value) &&
    isOptionalString(value.eip712Digest) &&
    isOptionalString(value.domainHash) &&
    isOptionalString(value.messageHash))

const isErc7730 = (value: unknown) =>
  value === undefined ||
  (isRecord(value) &&
    typeof value.title === 'string' &&
    isOptionalString(value.summary) &&
    isOptionalString(value.descriptorPath) &&
    Array.isArray(value.rows) &&
    value.rows.every(
      (row) =>
        isRecord(row) &&
        typeof row.label === 'string' &&
        typeof row.value === 'string' &&
        isOptionalString(row.path) &&
        isOptionalString(row.format)
    ))

const isPermitMessage = (value: unknown) =>
  isRecord(value) &&
  isStringOrNumber(value.deadline) &&
  typeof value.owner === 'string' &&
  typeof value.spender === 'string' &&
  isStringOrNumber(value.value) &&
  isStringOrNumber(value.nonce)

const isTransactionData = (value: unknown): value is TransactionDataView =>
  isRecord(value) &&
  typeof value.chainId === 'string' &&
  typeof value.type === 'string' &&
  (value.gasFeesSource === 'Dapp' || value.gasFeesSource === 'Frame') &&
  isOptionalString(value.gasLimit) &&
  isOptionalString(value.maxPriorityFeePerGas) &&
  isOptionalString(value.maxFeePerGas) &&
  isOptionalString(value.gasPrice) &&
  isOptionalString(value.to) &&
  isOptionalString(value.from) &&
  isOptionalString(value.data) &&
  isOptionalString(value.value) &&
  isOptionalString(value.calldataDigest)

const isTransactionEffect = (value: unknown) =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  ['native', 'erc20', 'allowance'].includes(String(value.kind)) &&
  ['in', 'out', 'neutral'].includes(String(value.direction)) &&
  typeof value.label === 'string' &&
  typeof value.symbol === 'string' &&
  isOptionalString(value.amount) &&
  (value.decimals === undefined || typeof value.decimals === 'number') &&
  isOptionalString(value.detail) &&
  isOptionalString(value.assetAddress) &&
  isOptionalString(value.logoURI)

const isTransactionRequest = (
  request: ProjectedRequest
): request is ProjectedRequest & TransactionRequestView => {
  if (!isRecord(request.payload) || request.payload.method !== 'eth_sendTransaction') return false
  const firstParam = Array.isArray(request.payload.params) ? request.payload.params[0] : undefined
  if (!isRecord(firstParam) || typeof firstParam.chainId !== 'string' || !isOptionalString(firstParam.data)) {
    return false
  }

  return (
    isTransactionData(request.data) &&
    (request.recognizedActions === undefined ||
      (Array.isArray(request.recognizedActions) &&
        request.recognizedActions.every((action) => isRecord(action) && typeof action.id === 'string'))) &&
    (request.decodedData === undefined ||
      (isRecord(request.decodedData) &&
        typeof request.decodedData.method === 'string' &&
        typeof request.decodedData.signature === 'string' &&
        Array.isArray(request.decodedData.args) &&
        request.decodedData.args.every((arg) => isRecord(arg) && typeof arg.value === 'string'))) &&
    (request.tokenData === undefined ||
      (isRecord(request.tokenData) &&
        typeof request.tokenData.name === 'string' &&
        typeof request.tokenData.symbol === 'string' &&
        (request.tokenData.decimals === undefined || typeof request.tokenData.decimals === 'number'))) &&
    (request.chainData === undefined ||
      (isRecord(request.chainData) &&
        (request.chainData.optimism === undefined ||
          (isRecord(request.chainData.optimism) &&
            typeof request.chainData.optimism.l1Fees === 'string')))) &&
    (request.simulation === undefined ||
      (isRecord(request.simulation) &&
        ['loading', 'success', 'unavailable', 'error'].includes(String(request.simulation.status)) &&
        (request.simulation.effects === undefined ||
          (Array.isArray(request.simulation.effects) &&
            request.simulation.effects.every(isTransactionEffect))))) &&
    (request.tx === undefined ||
      (isRecord(request.tx) &&
        isOptionalString(request.tx.hash) &&
        (request.tx.receipt === undefined ||
          (isRecord(request.tx.receipt) &&
            typeof request.tx.receipt.gasUsed === 'string' &&
            isOptionalString(request.tx.receipt.effectiveGasPrice))))) &&
    (request.feesUpdatedByUser === undefined || typeof request.feesUpdatedByUser === 'boolean') &&
    isOptionalString(request.recipient) &&
    isOptionalString(request.recipientType)
  )
}

function isRenderableRequest(request: ProjectedRequest): request is ProjectedRequest & RenderableRequestView {
  if (!isRequestBase(request)) return false

  switch (request.type) {
    case 'sign':
      return isRecord(request.data) && typeof request.data.decodedMessage === 'string'
    case 'signTypedData':
      return (
        isRecord(request.typedMessage) &&
        (isRecord(request.typedMessage.data) || Array.isArray(request.typedMessage.data)) &&
        typeof request.typedMessage.version === 'string' &&
        isDigests(request.digests) &&
        isErc7730(request.erc7730)
      )
    case 'signErc20Permit':
      return (
        isRecord(request.typedMessage) &&
        isRecord(request.typedMessage.data) &&
        isRecord(request.typedMessage.data.domain) &&
        typeof request.typedMessage.data.domain.chainId === 'number' &&
        typeof request.typedMessage.data.domain.verifyingContract === 'string' &&
        request.typedMessage.data.primaryType === 'Permit' &&
        isRecord(request.typedMessage.data.types) &&
        isPermitMessage(request.typedMessage.data.message) &&
        typeof request.typedMessage.version === 'string' &&
        isRecord(request.permit) &&
        isIdentity(request.permit.spender) &&
        isIdentity(request.permit.verifyingContract) &&
        isStringOrNumber(request.permit.value) &&
        isStringOrNumber(request.permit.deadline) &&
        typeof request.permit.owner === 'string' &&
        typeof request.permit.chainId === 'number' &&
        isStringOrNumber(request.permit.nonce) &&
        isRecord(request.tokenData) &&
        typeof request.tokenData.name === 'string' &&
        typeof request.tokenData.symbol === 'string' &&
        (request.tokenData.decimals === undefined || typeof request.tokenData.decimals === 'number') &&
        isRecord(request.payload) &&
        Array.isArray(request.payload.params) &&
        request.payload.params.length >= 2 &&
        isRecord(request.payload.params[1]) &&
        isRecord(request.payload.params[1].message) &&
        isStringOrNumber(request.payload.params[1].message.value) &&
        isDigests(request.digests) &&
        isErc7730(request.erc7730)
      )
    case 'transaction':
      return isTransactionRequest(request)
    case 'agentAccess':
      return (
        isRecord(request.data) &&
        isRecord(request.data.descriptor) &&
        typeof request.data.descriptor.name === 'string' &&
        typeof request.data.durationSeconds === 'number'
      )
    case 'access':
      return true
    case 'addChain':
      return (
        isRecord(request.chain) &&
        typeof request.chain.id === 'number' &&
        typeof request.chain.type === 'string' &&
        typeof request.chain.name === 'string'
      )
    case 'switchChain':
      return (
        isRecord(request.chain) &&
        (typeof request.chain.id === 'string' || typeof request.chain.id === 'number') &&
        typeof request.chain.type === 'string'
      )
    case 'addToken':
      return (
        isRecord(request.token) &&
        typeof request.token.address === 'string' &&
        typeof request.token.chainId === 'number' &&
        typeof request.token.decimals === 'number' &&
        typeof request.token.name === 'string' &&
        typeof request.token.symbol === 'string'
      )
    default:
      return assertNever(request.type)
  }
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
  capabilities: RequestRendererCapabilities
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
    useShallow((state: WalletRendererState) => ({
      accounts: state.accounts,
      crumb: state.windows.panel.nav[0],
      networks: state.networks.ethereum,
      networksMeta: state.networksMeta.ethereum,
      origins: state.origins
    }))
  )
  const back = () => {
    if (!requestView.back()) void props.capabilities.panel.back({ steps: 1 })
  }

  const renderRequest = (request: RenderableRequestView) => {
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
    switch (request.type) {
      case 'sign':
        return <SignatureRequest key={request.handlerId} req={request} />
      case 'signTypedData':
        return <SignTypedDataRequest key={request.handlerId} req={request} />
      case 'signErc20Permit':
        return (
          <SignPermitRequest
            capabilities={props.capabilities}
            chainData={chainData}
            key={request.handlerId}
            originName={origins[request.origin]?.name || ''}
            req={request}
            step={requestView.step}
          />
        )
      case 'transaction':
        return <TransactionRequest capabilities={props.capabilities} key={request.handlerId} req={request} />
      case 'agentAccess':
        return <AgentAccessRequest key={request.handlerId} req={request} />
      case 'access':
        return <ProviderRequest key={request.handlerId} req={request} />
      case 'addChain':
      case 'switchChain':
        return <ChainRequest key={request.handlerId} req={request} />
      case 'addToken':
        return <AddTokenRequest key={request.handlerId} req={request} />
      default:
        return assertNever(request)
    }
  }

  if (crumb?.view === 'requestView') {
    const { accountId, requestId } = crumb.data
    const projectedRequest = accountId && requestId ? accounts[accountId]?.requests[requestId] : undefined
    const request = projectedRequest && isRenderableRequest(projectedRequest) ? projectedRequest : undefined
    const accountViewTitle = request ? accountViewTitles[request.type] : ''

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
            <Requests
              account={crumb.data.account}
              capabilities={props.capabilities}
              expanded={true}
              moduleId='requests'
            />
          </div>
        </Stack>
      </AccountView>
    )
  }

  return null
}

function assertNever(value: never): never {
  throw new Error(`Unsupported request type: ${JSON.stringify(value)}`)
}

interface AccountProps extends Omit<AccountBodyProps, 'minimized'> {
  [key: string]: unknown
}

export default function Account(props: AccountProps) {
  const minimized = useWalletSelector((state: WalletRendererState) => state.selected.minimized)

  return <AccountBody {...props} minimized={minimized} />
}
