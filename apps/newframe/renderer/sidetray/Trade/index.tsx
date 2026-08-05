import React from 'react'
import { Button } from '@newframe/ui/button'
import { Disclosure } from '@newframe/ui/disclosure'
import { Field } from '@newframe/ui/field'
import { Grid } from '@newframe/ui/grid'
import { Group } from '@newframe/ui/group'
import { IconButton } from '@newframe/ui/icon-button'
import { Input } from '@newframe/ui/input'
import { Select } from '@newframe/ui/select'
import { Stack } from '@newframe/ui/stack'
import { Spacer } from '@newframe/ui/spacer'
import { Surface } from '@newframe/ui/surface'
import { Tabs } from '@newframe/ui/tabs'
import { Text } from '@newframe/ui/text'
import { ToggleButton } from '@newframe/ui/toggle-button'

import { BalanceRange } from '../../shared/ui/BalanceRange'
import { ProgressSteps } from '../../shared/ui/ProgressSteps'
import { SidePanel } from '../../shared/ui/SidePanel/SidePanel'
import TokenSelector from '../../shared/ui/TokenSelector'
import {
  getTokenSelectorPage,
  INITIAL_TOKEN_SELECTOR_ROWS,
  TOKEN_SELECTOR_ROWS_INCREMENT
} from '../../shared/ui/tokenSelectorModel'
import { createBalanceTokenSelectorItem, createDisplayBalance } from '../../../domain/balance'
import { persistedImageSource } from '../../../domain/image'
import {
  FLASH_LIMIT_ORDER_TYPE,
  FLASH_MARKET_ORDER_TYPE,
  FLASH_STOP_LOSS_ORDER_TYPE,
  FLASH_STOP_ORDER_TYPE,
  FLASH_TAKE_PROFIT_ORDER_TYPE,
  FLASH_TWAP_ORDER_TYPE
} from '../../../domain/flash/constants'
import { getContraPreposition, getDirectionLabel, isSameFlashAsset } from '../../../domain/flash/pair'
import { type FlashAsset, type FlashOrderType } from '../../../domain/flash/schemas'
import { formatUnits, toBigInt } from '../../../domain/units'
import { createSideTrayWalletSelector } from '../../state/selectors/sideTrayWallet'
import { useSideTraySelector } from '../../state/useAppSelector'
import { closeTrade } from './tradeService'
import {
  createInitialTradeState,
  getTradeOrderFields,
  getTradeInputAmount,
  getTradeSpentAsset,
  tradeReducer,
  type TradeAssetField
} from './tradeReducer'
import {
  buildTradeAssetOptions,
  buildVisualTradeSteps,
  createTradeBalanceIndex,
  formatTradeNotional,
  getFlashBalanceEntries,
  getEstimatedTradePriceImpact,
  getTradeAssetKey,
  getTradeQuoteValidationError,
  getTradeTriggerDeltaPercent,
  getTradeValidationError,
  type TradeOrderFields
} from './tradeTransaction'
import { useTradeExecution } from './useTradeExecution'
import { useTradeQuote, useTradeQuoteRequest } from './useTradeQuote'

const operationStatuses: Record<string, string> = {
  requesting: 'Starting trade',
  validating: 'Validating trade',
  wrapping: 'Confirm in Newframe',
  approving: 'Confirm in Newframe',
  signing_permit: 'Review permit in Newframe',
  signing_order: 'Review order in Newframe',
  submitting: 'Submitting order'
}
const completedStepCount: Record<string, number> = {
  awaiting_approval: 1,
  approving: 1,
  awaiting_submit: 2,
  signing_permit: 2,
  signing_order: 2,
  submitting: 3,
  submitted: 4
}
const pendingStepKinds: Record<string, string> = {
  wrapping: 'wrap',
  approving: 'approve',
  signing_permit: 'sign',
  signing_order: 'sign',
  submitting: 'submit'
}
const durationInputs = [
  ['durationDays', 'days', 'Days', '0'],
  ['durationHours', 'hours', 'Hours', '1'],
  ['durationMinutes', 'minutes', 'Minutes', '0']
] as const

function localDateTimeValue(date = new Date()) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

interface TradeProps {
  assetId?: string | null
  chainId?: number
}

export default function TradeForm({ assetId, chainId }: TradeProps) {
  const selectSideTrayWallet = React.useMemo(() => createSideTrayWalletSelector(), [])
  const { balanceSummaries, currentAccount, networks, networksMeta, operations, orders, runtime } =
    useSideTraySelector(selectSideTrayWallet)
  const tradeAssets = React.useMemo(
    () => buildTradeAssetOptions({ balances: balanceSummaries, networks, networksMeta, runtime }),
    [balanceSummaries, networks, networksMeta, runtime]
  )
  const tradeBalanceIndex = React.useMemo(() => createTradeBalanceIndex(balanceSummaries), [balanceSummaries])
  const flashBalanceEntries = React.useMemo(
    () => getFlashBalanceEntries(balanceSummaries, tradeAssets, tradeBalanceIndex),
    [balanceSummaries, tradeAssets, tradeBalanceIndex]
  )
  const [state, dispatch] = React.useReducer(
    tradeReducer,
    { assetId, assets: tradeAssets, balances: flashBalanceEntries, chainId },
    createInitialTradeState
  )
  const [assetRowsVisible, setAssetRowsVisible] = React.useState<Record<TradeAssetField, number>>({
    target: INITIAL_TOKEN_SELECTOR_ROWS,
    contra: INITIAL_TOKEN_SELECTOR_ROWS
  })
  const accountAddress = currentAccount?.address || ''
  const inputAmount = getTradeInputAmount(state)
  const quoteRequest = useTradeQuoteRequest({
    accountAddress,
    contraAsset: state.contraAsset,
    inputAmount,
    orderType: state.orderType,
    quickTrade: state.quickTrade,
    side: state.side,
    slippage: state.slippage,
    targetAsset: state.targetAsset,
    ...getTradeOrderFields(state)
  })
  const execution = useTradeExecution({ operations, requestKey: quoteRequest.requestKey })
  const operation = execution.operation
  useTradeQuote({ dispatch, paused: execution.blocksQuoteRefresh, quoteRequest })
  const ticketValidationError = React.useMemo(() => {
    const validationError = getTradeValidationError({
      ...getTradeOrderFields(state),
      inputAmount,
      orderType: state.orderType,
      side: state.side,
      slippage: state.slippage,
      targetAsset: state.targetAsset,
      contraAsset: state.contraAsset
    })

    return !inputAmount && validationError === 'Enter an amount to trade.' ? '' : validationError
  }, [inputAmount, state])
  const quoteValidationError = React.useMemo(
    () =>
      getTradeQuoteValidationError({
        orderType: state.orderType,
        quote: state.quote,
        triggerNotionalPrice: state.triggerNotionalPrice
      }),
    [state.orderType, state.quote, state.triggerNotionalPrice]
  )
  const tradeValidationError = ticketValidationError || quoteValidationError
  const operationError = execution.state.error
  const operationStatus =
    operationStatuses[execution.state.phase] || (state.quoteLoading ? 'Getting quote' : '')
  const invalidTradeFields = {
    amount: ticketValidationError === 'Enter an amount to trade.',
    duration: ticketValidationError.startsWith('TWAP duration'),
    expireTime: ticketValidationError.startsWith('Choose a future expiry time'),
    limitPrice:
      ticketValidationError === 'Enter a limit price.' ||
      ticketValidationError.startsWith('Enter a valid limit price') ||
      ticketValidationError.startsWith('Enter a valid TWAP limit price'),
    maxPriceImpact: ticketValidationError.startsWith('Max price impact'),
    slippage: ticketValidationError.startsWith('Max slippage'),
    startTime: ticketValidationError.startsWith('Choose a future TWAP start time'),
    triggerPrice: ticketValidationError === 'Enter a trigger price.' || Boolean(quoteValidationError),
    twapBucketCount: ticketValidationError.startsWith('Segments must')
  }

  React.useEffect(() => {
    dispatch({ type: 'setAssetOptions', assets: tradeAssets, balances: flashBalanceEntries })
  }, [flashBalanceEntries, tradeAssets])

  React.useEffect(() => {
    dispatch({ type: 'accountChanged' })
  }, [accountAddress])

  const getTradeDisplayBalance = React.useCallback(
    (asset: FlashAsset) => {
      const balance = tradeBalanceIndex.get(getTradeAssetKey(asset))
      if (!balance) return '0'

      return createDisplayBalance(balance).displayBalance
    },
    [tradeBalanceIndex]
  )

  const getTradeLogoURI = React.useCallback(
    (asset: FlashAsset) => {
      const balance = tradeBalanceIndex.get(getTradeAssetKey(asset))

      return (
        balance?.logoURI ||
        (asset.isNative ? persistedImageSource(networksMeta[asset.chainId]?.nativeCurrency?.image) : '')
      )
    },
    [networksMeta, tradeBalanceIndex]
  )

  const createTradeSelectorItem = React.useCallback(
    (asset: FlashAsset) => {
      const balance = tradeBalanceIndex.get(getTradeAssetKey(asset))

      if (balance) return { ...createBalanceTokenSelectorItem(balance), id: getTradeAssetKey(asset) }

      return {
        id: getTradeAssetKey(asset),
        symbol: asset.symbol,
        searchText: [asset.name, asset.address].filter(Boolean).join(' '),
        amountLabel: '0',
        notionalLabel: '$0.00',
        chainId: asset.chainId,
        logoURI: getTradeLogoURI(asset)
      }
    },
    [getTradeLogoURI, tradeBalanceIndex]
  )

  const handleSetTradeBalancePercent = React.useCallback(
    (asset: FlashAsset, percentValue: number) => {
      const balance = tradeBalanceIndex.get(getTradeAssetKey(asset))
      const rawBalance = toBigInt(balance?.balance || 0) || 0n
      const percent = Math.min(100, Math.max(0, Number.isFinite(percentValue) ? percentValue : 0))
      const basisPoints = BigInt(Math.round(percent * 100))
      const amount = (rawBalance * basisPoints) / 10_000n

      dispatch({
        type: 'setInputAmount',
        inputAmount: amount > 0n ? formatUnits(amount, asset.decimals) : ''
      })
    },
    [tradeBalanceIndex]
  )

  const getTradeBalancePercent = React.useCallback(
    (asset: FlashAsset, amount: string) => {
      const balance = tradeBalanceIndex.get(getTradeAssetKey(asset))
      const displayBalance = Number(formatUnits(toBigInt(balance?.balance || 0) || 0n, asset.decimals))
      const input = Number(String(amount || '').replace(/,/g, ''))

      if (!Number.isFinite(displayBalance) || displayBalance <= 0 || !Number.isFinite(input) || input <= 0) {
        return 0
      }

      return Math.min(100, Math.max(0, (input / displayBalance) * 100))
    },
    [tradeBalanceIndex]
  )

  React.useEffect(() => {
    if (operation?.status !== 'succeeded' || !execution.state.session) return
    const orderId = operation.entityRefs?.find((reference) => reference.type === 'order')?.id
    if (orderId && orders[orderId]) closeTrade()
  }, [execution.state.session, operation, orders])

  const reviewTrade = () => execution.submit({ quote: state.quote, quoteId: state.quoteId })

  const renderTradeTabs = () => {
    const orderType = state.orderType
    const tpSlActive = [FLASH_STOP_LOSS_ORDER_TYPE, FLASH_TAKE_PROFIT_ORDER_TYPE].includes(orderType)
    const tabs: { label: string; active: boolean; orderType: FlashOrderType }[] = [
      { label: 'Market', active: orderType === FLASH_MARKET_ORDER_TYPE, orderType: FLASH_MARKET_ORDER_TYPE },
      { label: 'Limit', active: orderType === FLASH_LIMIT_ORDER_TYPE, orderType: FLASH_LIMIT_ORDER_TYPE },
      { label: 'TWAP', active: orderType === FLASH_TWAP_ORDER_TYPE, orderType: FLASH_TWAP_ORDER_TYPE },
      {
        label: 'TP/SL',
        active: tpSlActive,
        orderType: tpSlActive ? orderType : FLASH_TAKE_PROFIT_ORDER_TYPE
      },
      { label: 'Stop', active: orderType === FLASH_STOP_ORDER_TYPE, orderType: FLASH_STOP_ORDER_TYPE }
    ]

    return (
      <Tabs
        label='Order type'
        items={tabs.map((tab) => ({ active: tab.active, id: tab.orderType, label: tab.label }))}
        onSelect={(orderType) => dispatch({ type: 'setOrderType', orderType })}
      />
    )
  }

  const renderOrderInput = ({
    ariaLabel,
    field,
    inputMode = 'decimal',
    invalid = false,
    label,
    placeholder,
    required = false,
    suffix,
    vertical = false
  }: {
    ariaLabel: string
    field: Exclude<keyof TradeOrderFields, 'expireTime' | 'startTime' | 'timeInForce'>
    inputMode?: 'decimal' | 'numeric'
    invalid?: boolean
    label: string
    placeholder: string
    required?: boolean
    suffix?: string
    vertical?: boolean
  }) => {
    return (
      <Field
        key={field}
        invalid={invalid}
        label={label}
        required={required}
        suffix={suffix}
        vertical={vertical}
      >
        <Input
          align='end'
          appearance='plain'
          invalid={invalid}
          label={ariaLabel}
          inputMode={inputMode}
          onValueChange={(value) => dispatch({ type: 'setOrderField', field, value })}
          placeholder={placeholder}
          required={required}
          value={state[field]}
        />
      </Field>
    )
  }

  const renderTradeOrderFields = () => {
    if (state.orderType === FLASH_MARKET_ORDER_TYPE) return null

    if (state.orderType === FLASH_LIMIT_ORDER_TYPE) {
      return (
        <Grid columns='one' gap='medium'>
          {renderOrderInput({
            ariaLabel: 'Limit price',
            field: 'limitNotionalPrice',
            invalid: invalidTradeFields.limitPrice,
            label: `${state.targetAsset.symbol}/USD limit`,
            placeholder: '0.00',
            required: true,
            suffix: 'USD'
          })}
        </Grid>
      )
    }

    if (state.orderType === FLASH_TWAP_ORDER_TYPE) {
      return (
        <Surface border='subtle' padding='medium' radius='small' tone='card'>
          <Stack gap='medium'>
            <Text variant='supporting'>
              Duration{' '}
              <Text decorative display='inline' variant='supporting' tone='danger'>
                *
              </Text>
            </Text>
            <Grid columns='three' gap='medium' responsive>
              {durationInputs.map(([field, unit, label, placeholder]) =>
                renderOrderInput({
                  ariaLabel: `TWAP duration ${unit}`,
                  field,
                  inputMode: 'numeric',
                  invalid: invalidTradeFields.duration,
                  label,
                  placeholder,
                  vertical: true
                })
              )}
            </Grid>
            <Text variant='detail' tone='secondary'>
              Minimum 5 minutes · Maximum 30 days
            </Text>
            <Grid columns='two' gap='medium' responsive>
              {renderOrderInput({
                ariaLabel: 'TWAP limit price',
                field: 'limitNotionalPrice',
                invalid: invalidTradeFields.limitPrice,
                label: `${state.targetAsset.symbol}/USD limit`,
                placeholder: 'Market',
                suffix: 'USD',
                vertical: true
              })}
              <Field invalid={invalidTradeFields.startTime} label='Starts' vertical>
                <Input
                  invalid={invalidTradeFields.startTime}
                  label='TWAP start time'
                  min={localDateTimeValue()}
                  onValueChange={(value) => dispatch({ type: 'setOrderField', field: 'startTime', value })}
                  type='datetime-local'
                  value={state.startTime}
                />
              </Field>
            </Grid>
            <Text variant='detail' tone='secondary'>
              Leave start blank to begin immediately · limit is optional
            </Text>
          </Stack>
        </Surface>
      )
    }

    if (
      [FLASH_STOP_ORDER_TYPE, FLASH_STOP_LOSS_ORDER_TYPE, FLASH_TAKE_PROFIT_ORDER_TYPE].includes(
        state.orderType
      )
    ) {
      const stop = state.orderType === FLASH_STOP_ORDER_TYPE
      const takeProfit = state.orderType === FLASH_TAKE_PROFIT_ORDER_TYPE
      const name = stop ? 'Stop' : takeProfit ? 'Take-profit' : 'Stop-loss'
      const shortName = stop ? state.targetAsset.symbol + '/USD' : takeProfit ? 'TP' : 'SL'
      const delta = getTradeTriggerDeltaPercent(state.triggerNotionalPrice, state.quote?.targetNotionalPrice)

      return (
        <Surface border='subtle' padding='medium' radius='small' tone='card'>
          <Stack gap='medium'>
            {!stop ? (
              <Group label='TP or SL'>
                <Surface padding='small' radius='small' tone='subtle'>
                  <Grid columns='two' gap='small'>
                    {(
                      [
                        ['Take profit', FLASH_TAKE_PROFIT_ORDER_TYPE],
                        ['Stop loss', FLASH_STOP_LOSS_ORDER_TYPE]
                      ] as const
                    ).map(([label, orderType]) => (
                      <ToggleButton
                        key={orderType}
                        onPress={() => dispatch({ type: 'setOrderType', orderType })}
                        pressed={state.orderType === orderType}
                        size='small'
                      >
                        <Text align='center' variant='supporting'>
                          {label}
                        </Text>
                      </ToggleButton>
                    ))}
                  </Grid>
                </Surface>
              </Group>
            ) : null}
            <Grid columns={stop ? 'two' : 'three'} gap='medium' responsive>
              {renderOrderInput({
                ariaLabel: `${name} trigger price`,
                field: 'triggerNotionalPrice',
                invalid: invalidTradeFields.triggerPrice,
                label: `${shortName} trigger`,
                placeholder: '0.00',
                required: true,
                suffix: 'USD',
                vertical: true
              })}
              {renderOrderInput({
                ariaLabel: `${name} limit price`,
                field: 'limitNotionalPrice',
                invalid: invalidTradeFields.limitPrice,
                label: stop ? 'Limit price' : `${shortName} limit`,
                placeholder: 'Market',
                suffix: 'USD',
                vertical: true
              })}
              {!stop ? (
                <Field label={takeProfit ? 'Gain' : 'Loss'} vertical>
                  <Text as='output' align='end' variant='numeric'>
                    {delta === null ? '—' : `${delta >= 0 ? '+' : ''}${delta.toFixed(2)}%`}
                  </Text>
                </Field>
              ) : null}
            </Grid>
            <Text variant='detail' tone='secondary'>
              {delta === null
                ? stop
                  ? 'Leave limit blank for a stop-market order'
                  : `Quoted against ${state.targetAsset.symbol}/USD`
                : `${delta >= 0 ? '+' : ''}${delta.toFixed(2)}% from current price`}
            </Text>
          </Stack>
        </Surface>
      )
    }

    return null
  }

  const renderTimeInForce = () => {
    const handleTimeInForceChange = (timeInForce: 'gtc' | 'gtt') => {
      dispatch({ type: 'setOrderField', field: 'timeInForce', value: timeInForce })

      if (timeInForce === 'gtt' && !state.expireTime) {
        const expiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        dispatch({ type: 'setOrderField', field: 'expireTime', value: localDateTimeValue(expiry) })
      }
    }

    return (
      <Stack gap='medium'>
        <Field label='Time in force' required>
          <Select
            label='Time in force'
            onValueChange={(value) => handleTimeInForceChange(value as 'gtc' | 'gtt')}
            options={[
              { label: 'Good till cancelled', value: 'gtc' },
              { label: 'Good till time', value: 'gtt' }
            ]}
            value={state.timeInForce}
          />
        </Field>
        {state.timeInForce === 'gtt' ? (
          <Field invalid={invalidTradeFields.expireTime} label='Expires' required>
            <Input
              label='Order expiry'
              invalid={invalidTradeFields.expireTime}
              min={localDateTimeValue()}
              onValueChange={(value) => dispatch({ type: 'setOrderField', field: 'expireTime', value })}
              required
              type='datetime-local'
              value={state.expireTime}
            />
          </Field>
        ) : null}
      </Stack>
    )
  }

  const renderTradeAdvancedFields = () => {
    if (state.orderType === FLASH_MARKET_ORDER_TYPE) {
      return (
        <Field invalid={invalidTradeFields.slippage} label='Max slippage' suffix='%'>
          <Input
            align='end'
            appearance='plain'
            invalid={invalidTradeFields.slippage}
            label='Slippage'
            inputMode='decimal'
            onValueChange={(slippage) => dispatch({ type: 'settingsChanged', slippage })}
            placeholder='Automatic'
            value={state.slippage}
          />
        </Field>
      )
    }

    if (state.orderType === FLASH_TWAP_ORDER_TYPE) {
      return (
        <Stack gap='medium'>
          {renderOrderInput({
            ariaLabel: 'TWAP segments',
            field: 'twapBucketCount',
            inputMode: 'numeric',
            invalid: invalidTradeFields.twapBucketCount,
            label: 'Segments',
            placeholder: 'Automatic'
          })}
          {renderOrderInput({
            ariaLabel: 'Maximum price impact',
            field: 'maxPriceImpact',
            invalid: invalidTradeFields.maxPriceImpact,
            label: 'Max price impact',
            placeholder: 'Automatic',
            suffix: '%'
          })}
        </Stack>
      )
    }

    return renderTimeInForce()
  }

  const renderTradeAssetSelector = (field: TradeAssetField, asset: FlashAsset, oppositeAsset: FlashAsset) => {
    const open = field === 'target' ? state.targetOpen : state.contraOpen
    const options = state.assetOptions.filter((option) => !isSameFlashAsset(option, oppositeAsset))
    const { items: selectorOptions, rowsHidden } = getTokenSelectorPage({
      getId: getTradeAssetKey,
      items: options,
      open,
      rowsVisible: assetRowsVisible[field],
      selectedId: getTradeAssetKey(asset)
    })
    const items = selectorOptions.map(createTradeSelectorItem)
    const searchableItems = options.map(createTradeSelectorItem)

    return (
      <TokenSelector
        ariaLabel={`Select ${field} asset`}
        footer={
          rowsHidden > 0 ? (
            <Stack>
              <Button
                onPress={() =>
                  setAssetRowsVisible((rows) => ({
                    ...rows,
                    [field]: rows[field] + TOKEN_SELECTOR_ROWS_INCREMENT
                  }))
                }
              >
                <Text align='center' variant='supporting' tone='secondary'>
                  {`Show ${Math.min(TOKEN_SELECTOR_ROWS_INCREMENT, rowsHidden)} more assets`}
                </Text>
              </Button>
            </Stack>
          ) : null
        }
        items={items}
        searchableItems={searchableItems}
        networks={networks}
        networksMeta={networksMeta}
        onOpenChange={(nextOpen) => dispatch({ type: 'setAssetOpen', field, open: nextOpen })}
        onSelect={(id) => {
          const selected = options.find((option) => getTradeAssetKey(option) === id)
          if (selected) dispatch({ type: 'selectAsset', field, asset: selected })
        }}
        open={open}
        selectedId={getTradeAssetKey(asset)}
      />
    )
  }

  const renderTradeDirectionSwitch = () => {
    const nextSide = state.side === 'buy' ? 'SELL' : 'BUY'

    return (
      <IconButton
        label={`Switch to ${nextSide}`}
        appearance='subtle'
        icon='swap'
        onPress={() => dispatch({ type: 'toggleSide' })}
        size='compact'
        title={`Switch to ${nextSide}`}
      />
    )
  }

  const renderTradeBalanceSlider = (asset: FlashAsset, amount: string) => {
    const percent = getTradeBalancePercent(asset, amount)

    return (
      <BalanceRange
        label={asset.symbol}
        balanceLabel={`Balance ${getTradeDisplayBalance(asset)} ${asset.symbol}`}
        direction={state.side}
        onChange={(value) => handleSetTradeBalancePercent(asset, value)}
        value={percent}
      />
    )
  }

  const renderTradeAssetCard = (field: TradeAssetField) => {
    const asset = field === 'target' ? state.targetAsset : state.contraAsset
    const oppositeAsset = field === 'target' ? state.contraAsset : state.targetAsset
    const amount = field === 'target' ? state.targetAmount : state.contraAmount
    const isTarget = field === 'target'
    const editable = state.side === 'buy' ? field === 'contra' : field === 'target'
    const intent = isTarget ? getDirectionLabel(state.side) : getContraPreposition(state.side).toUpperCase()
    const intentTone = isTarget ? (state.side === 'buy' ? 'special' : 'danger') : 'primary'
    const sideLocked = [
      FLASH_STOP_ORDER_TYPE,
      FLASH_STOP_LOSS_ORDER_TYPE,
      FLASH_TAKE_PROFIT_ORDER_TYPE
    ].includes(state.orderType)

    const assetCardBorder =
      editable && invalidTradeFields.amount
        ? 'danger'
        : editable && state.side === 'buy'
          ? 'special'
          : editable && state.side === 'sell'
            ? 'danger'
            : 'subtle'

    return (
      <Surface border={assetCardBorder} padding='medium' radius='small' tone={editable ? 'raised' : 'card'}>
        <Stack gap='medium'>
          <Stack align='center' direction='row' gap='small'>
            <Text variant='label' tone={intentTone}>
              {intent}
            </Text>
            {isTarget && !sideLocked ? renderTradeDirectionSwitch() : null}
          </Stack>
          <Stack align='center' direction='row' gap='medium' justify='between'>
            {renderTradeAssetSelector(field, asset, oppositeAsset)}
            <Stack grow>
              <Input
                align='end'
                appearance='amount'
                label={editable ? `${asset.symbol} amount` : `Estimated ${asset.symbol} received`}
                inputMode='decimal'
                onValueChange={
                  editable ? (inputAmount) => dispatch({ type: 'setInputAmount', inputAmount }) : undefined
                }
                placeholder='0'
                readOnly={!editable}
                spellCheck={false}
                value={amount}
              />
            </Stack>
          </Stack>
          {editable ? (
            renderTradeBalanceSlider(asset, amount)
          ) : (
            <Stack align='center' direction='row' gap='medium' justify='end'>
              <Text variant='supporting' tone='secondary'>
                Est. received
              </Text>
              {state.quote?.outputNotional ? (
                <Text as='strong' variant='detail'>
                  ~{formatTradeNotional(state.quote.outputNotional)}
                </Text>
              ) : null}
            </Stack>
          )}
        </Stack>
      </Surface>
    )
  }

  const renderTradeQuoteMeta = () => {
    const quote = state.quote
    if (!quote) return null

    const estimatedImpact = getEstimatedTradePriceImpact(quote)
    const feeNotional = quote.estimatedFeeNotional

    return (
      <Stack gap='large'>
        <Stack align='start' direction='row' gap='large' justify='between'>
          <Stack gap='xsmall'>
            <Text variant='label' tone='secondary'>
              Est. output
            </Text>
            <Text as='small' variant='caption' tone='secondary'>
              Including estimated fees
            </Text>
          </Stack>
          <Stack align='end' gap='xsmall'>
            <Text as='strong' align='end' variant='output'>
              {quote.outputAmount} {quote.receiveAsset.symbol}
            </Text>
            <Text as='small' align='end' variant='caption' tone='secondary'>
              ~{formatTradeNotional(quote.outputNotional)}
            </Text>
          </Stack>
        </Stack>
        <Stack gap='small'>
          <Stack align='center' direction='row' gap='large' justify='between'>
            <Text variant='detail' tone='secondary'>
              Est. price impact
            </Text>
            <Text
              as='strong'
              tone={estimatedImpact !== null && estimatedImpact > 1 ? 'danger' : 'primary'}
              variant='detail'
            >
              {estimatedImpact === null ? '—' : `${estimatedImpact.toFixed(2)}%`}
            </Text>
          </Stack>
          <Stack align='center' direction='row' gap='large' justify='between'>
            <Text variant='detail' tone='secondary'>
              Estimated fees
            </Text>
            <Text as='strong' variant='detail'>
              {feeNotional ? formatTradeNotional(feeNotional) : '—'}
            </Text>
          </Stack>
          {quote.targetNotionalPrice ? (
            <Stack align='center' direction='row' gap='large' justify='between'>
              <Text variant='detail' tone='secondary'>
                {quote.targetAsset.symbol}/USD
              </Text>
              <Text as='strong' variant='detail'>
                {formatTradeNotional(quote.targetNotionalPrice)}
              </Text>
            </Stack>
          ) : null}
        </Stack>
      </Stack>
    )
  }

  const renderTradeSteps = () => {
    const spentAsset = getTradeSpentAsset(state)
    const baseSteps = state.quote?.steps || buildVisualTradeSteps(spentAsset, false)
    const phase = operation?.phase || ''
    const completed = new Set(['wrap', 'approve', 'sign', 'submit'].slice(0, completedStepCount[phase] || 0))
    if (operation?.status === 'succeeded') completed.add('submit')
    const pendingKind = pendingStepKinds[phase] || ''
    const failedKind = phase.endsWith('_failed') ? phase.slice(0, -'_failed'.length) : ''
    const steps = baseSteps.map((step) => ({
      ...step,
      ...(completed.has(step.kind) ? { status: 'complete' as const, error: undefined } : {}),
      ...(pendingKind === step.kind ? { status: 'pending' as const, error: undefined } : {}),
      ...(failedKind === step.kind
        ? { status: 'error' as const, error: operationError || 'Trade failed.' }
        : {})
    }))

    return <ProgressSteps steps={steps} />
  }

  const renderTradeAdvanced = () => {
    return (
      <Disclosure
        icon='settings'
        label='Advanced'
        onToggle={() => dispatch({ type: 'toggleAdvancedOpen' })}
        open={state.advancedOpen}
      >
        {renderTradeAdvancedFields()}
      </Disclosure>
    )
  }

  const renderTradeFooter = () => {
    const nextAction =
      execution.state.phase === 'awaiting_approval'
        ? 'approve'
        : execution.state.phase === 'awaiting_submit'
          ? 'sign'
          : state.quote?.nextAction
    const enabled = Boolean(
      state.quote && state.quoteId && execution.canSubmit && !state.quoteLoading && !tradeValidationError
    )
    const primaryLabel = state.quoteLoading
      ? 'Getting quote'
      : execution.state.phase === 'submitting'
        ? 'Submitting'
        : nextAction === 'wrap'
          ? state.quote?.actions?.wrap?.label || 'Wrap'
          : nextAction === 'approve'
            ? state.quote?.actions?.approval?.label || 'Approve'
            : state.quote
              ? 'Review/sign'
              : 'Enter details'

    return (
      <Stack grow>
        <Button appearance='primary' disabled={!enabled} onPress={reviewTrade} size='large'>
          <Text align='center' variant='action' tone='inverse'>
            {tradeValidationError && state.quote ? 'Adjust order' : primaryLabel}
          </Text>
        </Button>
      </Stack>
    )
  }

  return (
    <SidePanel
      closeLabel='Close Trade'
      footer={renderTradeFooter()}
      footerSpace='compact'
      onClose={() => {
        execution.reset()
        closeTrade()
      }}
      title='Trade'
    >
      <Stack gap='large' grow>
        {renderTradeTabs()}
        {renderTradeAssetCard('target')}
        {renderTradeAssetCard('contra')}
        {renderTradeOrderFields()}
        {renderTradeAdvanced()}
        {state.quote ? (
          <Surface border='subtle' padding='medium' radius='small' tone='transparent'>
            {renderTradeQuoteMeta()}
          </Surface>
        ) : null}
        {state.error || operationError || tradeValidationError ? (
          <Text align='center' variant='body' tone='danger'>
            {state.error || operationError || tradeValidationError}
          </Text>
        ) : null}
        {operationStatus ? (
          <Text align='center' variant='body' tone='secondary'>
            {operationStatus}
          </Text>
        ) : null}
        <Spacer />
        {renderTradeSteps()}
      </Stack>
    </SidePanel>
  )
}
