import link from '../../../../shared/link'
import { AddressIdentity } from '../../../../shared/ui/AddressIdentity'
import { DisplayCoinBalance } from '../../../../shared/ui/DisplayValue'
import { Button } from '@newframe/ui/button'
import { Inline } from '@newframe/ui/inline'
import { Stack } from '@newframe/ui/stack'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'
import { Icon } from '@newframe/ui/icon'
import { useState } from 'react'
import { getPaidTransactionFee, getTransactionEffects, usesBaseFee } from '../../../../../domain/transaction'
import { chainUsesOptimismFees } from '../../../../../domain/chain/fees'
import { displayValueData } from '../../../../shared/format/displayValue'
import { getAddress } from '../../../../../domain/address'
import { toBigInt } from '../../../../../domain/units'
import { tokenForId, tokenImageSource } from '../../../../../domain/token'
import TransactionInformation from './TransactionInformation'
import type { TransactionInformationDetailRow } from './TransactionInformation'
import {
  useAccountIdentity,
  useAssetRate,
  useNetwork,
  useNetworkMetadata,
  useOriginName,
  useTokens
} from '../state'
import { NATIVE_CURRENCY } from '../../../../../domain/token/constants'
import { persistedImageSource } from '../../../../../domain/image'
import { useRequestView } from '../../../requestView'
import type { TransactionRequest } from '../../../../../contracts/requests'

type NativeCurrency = {
  symbol: string
  icon?: string
  usd?: { price: number }
}

type TxFeeSummaryProps = {
  req: TransactionRequest
  chain: { type: 'ethereum'; id: number }
  nativeCurrency: NativeCurrency
  isTestnet: boolean
  gasPrice?: { selected?: string }
  openAdjustFee(): void
}

type TxReviewProps = {
  req: TransactionRequest
  network: ReturnType<typeof useNetwork>
  networkMetadata: ReturnType<typeof useNetworkMetadata>
  originName: string
  tokens: ReturnType<typeof useTokens>
  openAdjustFee(): void
}

type TxReviewWithStateProps = Pick<TxReviewProps, 'req'>

const FEE_WARNING_THRESHOLD_USD = 50
const FEE_RATE_OPTIONS = [
  { id: 'asap', label: 'Very fast' },
  { id: 'fast', label: 'Fast' },
  { id: 'standard', label: 'Standard' },
  { id: 'slow', label: 'Slow' },
  { id: 'custom', label: 'Custom' }
] as const

const displayStatus = (req: TransactionRequest) => {
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
  recipient?: ActionIdentity | string
}

const actionData = (req: TransactionRequest, id: string) =>
  (req.recognizedActions?.find((action) => action.id === id)?.data || {}) as ActionData

const transferRecipient = (req: TransactionRequest): ActionIdentity | undefined => {
  const recognized = actionData(req, 'erc20:transfer').recipient
  if (typeof recognized === 'string') return { address: recognized }
  if (recognized?.address) return recognized

  if (req.decodedData?.method !== 'transfer' && req.decodedData?.signature !== 'transfer(address,uint256)') {
    return undefined
  }
  const decoded = req.decodedData?.args?.[0]?.value
  return typeof decoded === 'string' ? { address: decoded } : undefined
}

export function TxFeeSummary(props: TxFeeSummaryProps) {
  const [expanded, setExpanded] = useState(false)
  const getOptimismFee = (l2Price: bigint, l2Limit: bigint, chainData?: { l1Fees?: string }) => {
    const l1DataFee = toBigInt(chainData?.l1Fees ?? '')
    if (l1DataFee === undefined) return undefined

    return l2Price * l2Limit + l1DataFee
  }

  const applyFeeRate = (option: (typeof FEE_RATE_OPTIONS)[number]) => {
    const { req } = props

    if (option.id === 'custom') {
      props.openAdjustFee()
      return
    }

    void link.executeCommand({
      type: 'transaction.fee-default-set',
      requestId: req.handlerId,
      level: option.id
    })
    setExpanded(false)
  }

  const { req, chain, nativeCurrency, isTestnet } = props
  const paidFee = getPaidTransactionFee(req)
  const resolvedNativeRate = useAssetRate({
    chainId: chain.id,
    address: NATIVE_CURRENCY,
    nativeTicker: nativeCurrency.symbol
  })
  const nativeCurrencyRate = !isTestnet ? resolvedNativeRate : undefined

  const maxGas = toBigInt(req.data.gasLimit) ?? 0n
  const maxFeePerGas = toBigInt(req.data[usesBaseFee(req.data) ? 'maxFeePerGas' : 'gasPrice']) ?? 0n
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
  const selectedRate = req.feesUpdatedByUser ? 'custom' : props.gasPrice?.selected || 'fast'
  const selectedRateLabel = FEE_RATE_OPTIONS.find((option) => option.id === selectedRate)?.label || 'Fast'
  const canAdjustFee = !paidFee && !req.status

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

export function TxReview(props: TxReviewProps) {
  const copyAddress = (data: string) => {
    void link.executeCommand({ type: 'clipboard.write', text: data })
  }

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
  const effects = getTransactionEffects(req, symbol).map((effect) => {
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
        ? 'Simulation unavailable'
        : 'No direct asset changes detected'
  const notice =
    req.notice && req.notice.toLowerCase() !== (req.status || '').toLowerCase() ? req.notice : undefined
  const signingAccount = useAccountIdentity(req.account || from)
  const recipient = transferRecipient(req)
  const displayTo = recipient?.address || to
  const destinationAccount = useAccountIdentity(displayTo)
  const tokenAction =
    req.recognizedActions?.find((action) => ['erc20:approve', 'erc20:revoke'].includes(action.id))?.id || ''
  const token = tokenAction ? actionData(req, tokenAction) : undefined
  const toName = recipient
    ? recipient.ens || destinationAccount?.name
    : token?.name ||
      token?.symbol ||
      req.tokenData?.name ||
      req.tokenData?.symbol ||
      req.recipient ||
      destinationAccount?.name
  const details: TransactionInformationDetailRow[] = [
    {
      label: 'To',
      value: (
        <AddressIdentity
          address={displayTo}
          name={toName}
          onCopy={displayTo ? () => copyAddress(displayTo) : undefined}
        />
      )
    },
    { label: 'Method', value: method }
  ]

  return (
    <TransactionInformation
      originName={originName}
      networkName={chainName}
      networkIcon={persistedImageSource(meta.image)}
      statusLabel={displayStatus(req)}
      notice={notice}
      effects={effects}
      effectsEmptyText={effectsEmptyText}
      details={details}
      calldata={
        calldata && calldata !== '0x'
          ? { data: calldata, digest: req.data.calldataDigest || 'Digest unavailable' }
          : undefined
      }
      nativeCurrency={nativeCurrency}
    >
      <Stack gap='xsmall'>
        <Surface padding='small' radius='card' tone='card'>
          <Inline align='center' gap='small' justify='between'>
            <Text tone='secondary' variant='overline'>
              Signing with
            </Text>
            <Inline align='center' gap='xsmall'>
              <Icon name='wallet' size='small' tone='accent' />
              <AddressIdentity
                address={from}
                name={signingAccount?.name || signingAccount?.ensName}
                onCopy={from ? () => copyAddress(from) : undefined}
              />
            </Inline>
          </Inline>
        </Surface>
        <TxFeeSummary
          chain={chain}
          gasPrice={meta.gas?.price}
          isTestnet={Boolean(network.isTestnet)}
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
  const { open } = useRequestView()
  return (
    <TxReview
      {...props}
      network={network}
      networkMetadata={networkMetadata}
      originName={originName}
      tokens={tokens}
      openAdjustFee={() => open({ step: 'adjustFee' })}
    />
  )
}
