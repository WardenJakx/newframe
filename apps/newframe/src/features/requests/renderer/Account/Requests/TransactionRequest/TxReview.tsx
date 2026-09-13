import { Button } from '@newframe/ui/button'
import { Icon } from '@newframe/ui/icon'
import { Inline } from '@newframe/ui/inline'
import { Stack } from '@newframe/ui/stack'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'
import { formatUnits } from 'ethers'
import { useState } from 'react'

import { getAddress } from '../../../../../../shared/domain/address'
import { toBigInt } from '../../../../../../shared/domain/units'
import { AddressIdentity, shortAddress } from '../../../../../../shared/renderer/ui/AddressIdentity'
import { persistedImageSource } from '../../../../../asset-data/domain/image'
import { chainUsesOptimismFees } from '../../../../../networks/domain/chain/fees'
import { tokenForId, tokenImageSource } from '../../../../../tokens/domain'
import { NATIVE_CURRENCY } from '../../../../../tokens/domain/constants'
import {
  getPaidTransactionFee,
  getTransactionEffects,
  getTransactionIntent,
  typeSupportsBaseFee
} from '../../../../../transactions/domain'
import type { TransactionFeeLevel } from '../../../../../transactions/domain/fees'
import { displayValueData } from '../../../format/displayValue'
import type { RequestRendererCapabilities, TransactionReviewCapability } from '../../../requestCapabilities'
import { useRequestView } from '../../../requestView'
import { DisplayCoinBalance } from '../../../ui/DisplayValue'
import { SigningAccount } from '../../../ui/SigningAccount'
import type { TransactionRequestView } from '../requestViewTypes'
import {
  useAccountIdentity,
  useAssetRate,
  useNetwork,
  useNetworkMetadata,
  useOriginName,
  useTokens
} from '../state'
import TransactionInformation from './TransactionInformation'
import type { TransactionInformationDetailRow } from './TransactionInformation'

type NativeCurrency = {
  symbol: string
  icon?: string
  usd?: { price: number }
}

type TxFeeSummaryProps = {
  feeLevel?: TransactionFeeLevel | 'custom'
  selectFeeLevel(level: TransactionFeeLevel): void
  capability: Pick<TransactionReviewCapability, 'setFeePreference'>
  req: TransactionRequestView
  chain: { type: 'ethereum'; id: number }
  nativeCurrency: NativeCurrency
  isTestnet: boolean
  gasPrice?: NonNullable<ReturnType<typeof useNetworkMetadata>['gas']>['price']
  nativeCurrencyRate: ReturnType<typeof useAssetRate>
  openAdjustFee(): void
}

type TxReviewProps = {
  feeLevel?: TransactionFeeLevel | 'custom'
  selectFeeLevel(level: TransactionFeeLevel): void
  capabilities: Pick<RequestRendererCapabilities, 'external' | 'transaction'>
  destinationAccount: ReturnType<typeof useAccountIdentity>
  nativeCurrencyRate: ReturnType<typeof useAssetRate>
  req: TransactionRequestView
  network: ReturnType<typeof useNetwork>
  networkMetadata: ReturnType<typeof useNetworkMetadata>
  originName: string
  signingAccount: ReturnType<typeof useAccountIdentity>
  tokens: ReturnType<typeof useTokens>
  openAdjustFee(): void
}

type TxReviewWithStateProps = Pick<TxReviewProps, 'capabilities' | 'req'>

const FEE_WARNING_THRESHOLD_USD = 50
const FEE_RATE_OPTIONS = [
  { id: 'asap', label: 'Very fast' },
  { id: 'fast', label: 'Fast' },
  { id: 'standard', label: 'Standard' },
  { id: 'slow', label: 'Slow' },
  { id: 'custom', label: 'Custom' }
] as const

const displayStatus = (req: TransactionRequestView) => {
  const notice = (req.notice || '').toLowerCase()
  const status = (req.status || 'ready to sign').toLowerCase()

  if (status === 'pending' && notice === 'see signer') return 'waiting for device signature'
  if (status === 'verifying') return 'waiting for block'
  return status
}

type ActionIdentity = { address?: string; ens?: string }
type ActionData = {
  name?: string
  symbol?: string
  decimals?: number
  amount?: string
  recipient?: ActionIdentity
  spender?: ActionIdentity
  contract?: ActionIdentity
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const actionData = (req: TransactionRequestView, id: string): ActionData => {
  const value = req.recognizedActions?.find((action) => action.id === id)?.data
  if (!isRecord(value)) return {}

  const identity = (candidate: unknown): ActionIdentity | undefined => {
    if (typeof candidate === 'string') return { address: candidate }
    if (!isRecord(candidate) || typeof candidate.address !== 'string') return undefined
    return { address: candidate.address, ens: typeof candidate.ens === 'string' ? candidate.ens : undefined }
  }

  return {
    name: typeof value.name === 'string' ? value.name : undefined,
    symbol: typeof value.symbol === 'string' ? value.symbol : undefined,
    decimals:
      typeof value.decimals === 'number' &&
      Number.isInteger(value.decimals) &&
      value.decimals >= 0 &&
      value.decimals <= 255
        ? value.decimals
        : undefined,
    amount: typeof value.amount === 'string' ? value.amount : undefined,
    recipient: identity(value.recipient),
    spender: identity(value.spender),
    contract: identity(value.contract)
  }
}

const transferRecipient = (req: TransactionRequestView): ActionIdentity | undefined => {
  const recognized = actionData(req, 'erc20:transfer').recipient
  if (recognized?.address) return recognized

  if (req.decodedData?.signature !== 'transfer(address,uint256)') {
    return undefined
  }
  const decoded = req.decodedData?.args?.[0]?.value
  return typeof decoded === 'string' ? { address: decoded } : undefined
}

function TxFeeSummary(props: TxFeeSummaryProps) {
  const [expanded, setExpanded] = useState(false)
  const getOptimismFee = (l2Price: bigint, l2Limit: bigint, chainData?: { l1Fees?: string }) => {
    const l1DataFee = toBigInt(chainData?.l1Fees ?? '')
    if (l1DataFee === undefined) return undefined

    return l2Price * l2Limit + l1DataFee
  }

  const applyFeeRate = (option: (typeof FEE_RATE_OPTIONS)[number]) => {
    if (option.id === 'custom') {
      props.openAdjustFee()
      return
    }

    props.selectFeeLevel(option.id)
    void props.capability.setFeePreference({
      chainId: props.chain.id,
      level: option.id
    })
    setExpanded(false)
  }

  const { req, chain, nativeCurrency, isTestnet } = props
  const paidFee = getPaidTransactionFee(req)
  const nativeCurrencyRate = !isTestnet ? props.nativeCurrencyRate : undefined

  const maxGas = toBigInt(req.data.gasLimit) ?? 0n
  const maxFeePerGas =
    toBigInt(req.data[typeSupportsBaseFee(req.data.type) ? 'maxFeePerGas' : 'gasPrice']) ?? 0n
  const executionFee = maxFeePerGas * maxGas
  const maxFeeSourceValue = chainUsesOptimismFees(chain.id)
    ? getOptimismFee(maxFeePerGas, maxGas, req.chainData?.optimism)
    : executionFee
  const displayedFee = paidFee || maxFeeSourceValue || executionFee
  const fee = displayValueData(displayedFee, {
    currencyRate: nativeCurrencyRate,
    isTestnet
  })
  const feeUSD = fee.fiat()
  const gasDisplay = displayValueData(maxFeePerGas).gwei()
  const shouldWarn = feeUSD.value > FEE_WARNING_THRESHOLD_USD
  const selectedRate =
    (!req.status && !req.locked ? props.feeLevel : undefined) ||
    (req.feesUpdatedByUser ? 'custom' : props.gasPrice?.selected || 'fast')
  const selectedRateLabel = FEE_RATE_OPTIONS.find((option) => option.id === selectedRate)?.label || 'Fast'
  const canAdjustFee = !paidFee && !req.status && !req.locked

  return (
    <section aria-label='Network fee'>
      <Surface padding='none' radius='card' tone='card'>
        <Stack gap='none'>
          <Button
            appearance='disclosure'
            expanded={expanded}
            label={`${expanded ? 'Hide' : 'Show'} gas fee settings`}
            onPress={() => setExpanded((current) => !current)}
            size='medium'
            width='full'
          >
            <Inline align='center' gap='small' justify='between'>
              <Text tone='secondary' variant='overline'>
                Gas fee
              </Text>
              <Inline align='center' gap='small'>
                <Text tone={shouldWarn ? 'danger' : 'primary'} variant='control'>
                  {fee.bn === undefined ? (
                    `? ${nativeCurrency.symbol}`
                  ) : (
                    <DisplayCoinBalance amount={fee} symbol={nativeCurrency.symbol} />
                  )}
                </Text>
                {canAdjustFee ? (
                  <Text tone='accent' variant='caption'>
                    {selectedRateLabel}
                  </Text>
                ) : null}
                <Icon name={expanded ? 'chevronUp' : 'chevronDown'} size='small' tone='muted' />
              </Inline>
            </Inline>
          </Button>
          {expanded ? (
            <Surface padding='small' radius='none' tone='card'>
              <Stack gap='small'>
                <Inline align='center' gap='small' justify='between'>
                  <Text tone='secondary' variant='caption'>
                    {paidFee ? 'Paid network fee' : 'Maximum network fee'}
                  </Text>
                  <Text tone='secondary' variant='caption' shrink={false}>
                    {gasDisplay.displayValue} Gwei
                  </Text>
                </Inline>
                {canAdjustFee ? (
                  <Stack direction='row' equal gap='xsmall' label='Fee rate'>
                    {FEE_RATE_OPTIONS.map((option) => (
                      <Button
                        appearance='segment'
                        key={option.id}
                        onPress={() => applyFeeRate(option)}
                        pressed={selectedRate === option.id}
                        size='small'
                      >
                        <Text truncate variant='caption'>
                          {option.label}
                        </Text>
                      </Button>
                    ))}
                  </Stack>
                ) : null}
              </Stack>
            </Surface>
          ) : null}
        </Stack>
      </Surface>
    </section>
  )
}

function TxReviewView(props: TxReviewProps) {
  const { req } = props
  const chainId = parseInt(req.data.chainId, 16)
  const chain = { type: 'ethereum' as const, id: chainId }
  const { network, networkMetadata: meta } = props
  const nativeCurrency = meta.nativeCurrency || { symbol: '?', icon: undefined }
  const symbol = nativeCurrency.symbol || '?'
  const chainName = network.name || `Chain ${chainId}`
  const originName = props.originName || req.origin
  const to = req.data.to ? getAddress(req.data.to) : ''
  const from = req.data.from || req.account
  const calldata = req.data.data
  const method = req.decodedData?.method
  const hasRecognizedTokenAction = req.recognizedActions?.some((action) =>
    ['erc20:transfer', 'erc20:approve', 'erc20:revoke'].includes(action.id)
  )
  const ambiguousApproval =
    req.decodedData?.signature === 'approve(address,uint256)' && !hasRecognizedTokenAction
  const effectsRequest = ambiguousApproval ? { ...req, decodedData: undefined } : req
  const effects = getTransactionEffects(effectsRequest, symbol).map((original) => {
    const effect =
      original.kind !== 'native' && !Number.isInteger(original.decimals)
        ? { ...original, decimals: 0, symbol: 'raw units' }
        : original
    if (effect.kind !== 'erc20' || !effect.assetAddress) return effect

    const tokenId = `${chainId}:${effect.assetAddress.toLowerCase()}`
    const canonicalImage = tokenImageSource(tokenForId(props.tokens, tokenId))
    return {
      ...effect,
      tokenId,
      ...(canonicalImage ? { logoURI: canonicalImage } : {})
    }
  })
  const simulationStatus = req.simulation?.status
  const effectsEmptyText =
    simulationStatus === 'loading'
      ? 'Checking asset changes'
      : simulationStatus === 'error' || simulationStatus === 'unavailable'
        ? undefined
        : 'No direct asset changes detected'
  const notice =
    req.notice && req.notice.toLowerCase() !== (req.status || '').toLowerCase() ? req.notice : undefined
  const recipient = transferRecipient(req)
  const actionId = req.recognizedActions?.find((action) =>
    ['erc20:transfer', 'erc20:approve', 'erc20:revoke'].includes(action.id)
  )?.id
  const token = actionId ? actionData(req, actionId) : undefined
  const isTransfer =
    actionId === 'erc20:transfer' || req.decodedData?.signature === 'transfer(address,uint256)'
  const isApproval = actionId === 'erc20:approve' || actionId === 'erc20:revoke'
  const nativeTransfer = req.classification === 'NATIVE_TRANSFER'
  const intent = getTransactionIntent(effectsRequest, symbol)
  const nativeAmount = formatUnits(toBigInt(req.data.value) ?? 0n, meta.nativeCurrency?.decimals ?? 18)
  const amount = token?.amount ?? req.decodedData?.args[1]?.value
  const tokenDecimals = req.tokenData?.decimals ?? token?.decimals
  const knownDecimals =
    tokenDecimals !== undefined &&
    Number.isInteger(tokenDecimals) &&
    tokenDecimals >= 0 &&
    tokenDecimals <= 255
  const tokenSymbol = token?.symbol || req.tokenData?.symbol
  const tokenAmount = toBigInt(amount)
  const amountText =
    tokenAmount === undefined
      ? 'Amount unavailable'
      : knownDecimals
        ? `${formatUnits(tokenAmount, tokenDecimals)} ${tokenSymbol || 'tokens'}`
        : `${tokenAmount.toString()} raw units`
  const addressValue = (address: string, nickname?: string) => (
    <AddressIdentity
      address={address}
      clipboard={props.capabilities.external}
      nickname={nickname || shortAddress(address)}
      showFullAddress
    />
  )
  const contractName = token?.name || tokenSymbol || req.decodedData?.contractName || req.recipient
  const spender = token?.spender ?? (isApproval ? { address: req.decodedData?.args[0]?.value } : undefined)
  const details: TransactionInformationDetailRow[] = nativeTransfer
    ? [{ label: 'To', value: addressValue(to, req.recipient || props.destinationAccount?.name) }]
    : isTransfer || isApproval
      ? [
          {
            label: isTransfer ? 'To' : 'Spender',
            value: isTransfer
              ? recipient?.address
                ? addressValue(recipient.address, recipient.ens || props.destinationAccount?.name)
                : 'Recipient unavailable'
              : spender?.address
                ? addressValue(spender.address, spender.ens)
                : 'Spender unavailable'
          },
          { label: 'Amount', value: amountText },
          { label: 'Token contract', value: addressValue(token?.contract?.address || to, contractName) }
        ]
      : [
          { label: 'On contract', value: addressValue(to, contractName || props.destinationAccount?.name) },
          ...(req.decodedData?.args.map((arg, index) => ({
            label: `${arg.name || `Argument ${index + 1}`}${arg.type ? ` (${arg.type})` : ''}`,
            value: arg.type === 'address' ? addressValue(arg.value) : arg.value
          })) || []),
          ...(!req.decodedData && calldata && calldata !== '0x'
            ? [{ label: 'Selector', value: calldata.slice(0, 10) }]
            : [])
        ]
  if (!nativeTransfer && (toBigInt(req.data.value) ?? 0n) > 0n) {
    details.push({ label: 'Attached value', value: `${nativeAmount} ${symbol}` })
  }
  const actionTitle = nativeTransfer
    ? `Send ${nativeAmount} ${symbol}`
    : isTransfer || isApproval
      ? intent.title
      : method
        ? `Call ${method}`
        : intent.title
  const transactionHash = req.tx?.hash

  return (
    <TransactionInformation
      imageCapability={props.capabilities.external}
      clipboard={props.capabilities.external}
      actionTitle={actionTitle}
      actionNotice={
        !req.decodedData && !actionId && calldata && calldata !== '0x' ? (
          <Text tone='secondary' variant='caption'>
            Cannot decode calldata. Inspect the selector and raw bytes.
          </Text>
        ) : undefined
      }
      verification={transactionHash ? [{ label: 'Transaction hash', value: transactionHash }] : undefined}
      rawTransaction={JSON.stringify(req.data, null, 2)}
      wrapDetailValues
      originName={originName}
      networkName={chainName}
      networkIcon={persistedImageSource(meta.image)}
      statusLabel={displayStatus(req)}
      notice={notice}
      effects={effects}
      effectsEmptyText={effectsEmptyText}
      effectsNotice={
        simulationStatus === 'error' || simulationStatus === 'unavailable' ? (
          <div role='alert'>
            <Text variant='caption' tone='danger'>
              {req.simulation?.error || 'Simulation unavailable'}
            </Text>
          </div>
        ) : undefined
      }
      details={details}
      calldata={
        calldata && calldata !== '0x' ? { data: calldata, digest: req.data.calldataDigest } : undefined
      }
      nativeCurrency={nativeCurrency}
    >
      <Stack gap='xsmall'>
        <SigningAccount label='Account'>
          <AddressIdentity
            address={from}
            clipboard={props.capabilities.external}
            nickname={props.signingAccount?.name || props.signingAccount?.ensName || shortAddress(from)}
            showFullAddress
          />
        </SigningAccount>
        <TxFeeSummary
          feeLevel={props.feeLevel}
          selectFeeLevel={props.selectFeeLevel}
          capability={props.capabilities.transaction}
          chain={chain}
          gasPrice={meta.gas?.price}
          isTestnet={Boolean(network.isTestnet)}
          nativeCurrencyRate={props.nativeCurrencyRate}
          nativeCurrency={nativeCurrency}
          openAdjustFee={() => props.openAdjustFee()}
          req={req}
        />
      </Stack>
    </TransactionInformation>
  )
}

export default function TxReviewWithState(props: TxReviewWithStateProps) {
  const chainId = parseInt(props.req.data.chainId, 16)
  const network = useNetwork('ethereum', chainId)
  const networkMetadata = useNetworkMetadata('ethereum', chainId)
  const originName = useOriginName(props.req.origin)
  const tokens = useTokens()
  const from = props.req.data.from || props.req.account
  const recipient = transferRecipient(props.req)
  const to = props.req.data.to ? getAddress(props.req.data.to) : ''
  const destinationAccount = useAccountIdentity(recipient?.address || to)
  const signingAccount = useAccountIdentity(from)
  const nativeCurrencyRate = useAssetRate({
    chainId,
    address: NATIVE_CURRENCY,
    nativeTicker: networkMetadata.nativeCurrency?.symbol || '?'
  })
  const { open, feeLevel, selectFeeLevel } = useRequestView()
  return (
    <TxReviewView
      {...props}
      feeLevel={feeLevel}
      selectFeeLevel={(level) => selectFeeLevel(props.req, level, networkMetadata.gas?.price)}
      destinationAccount={destinationAccount}
      nativeCurrencyRate={nativeCurrencyRate}
      network={network}
      networkMetadata={networkMetadata}
      originName={originName}
      signingAccount={signingAccount}
      tokens={tokens}
      openAdjustFee={() => open({ step: 'adjustFee' })}
    />
  )
}
