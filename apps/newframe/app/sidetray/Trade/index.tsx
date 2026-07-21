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

import { BalanceRange } from '../../../resources/Components/BalanceRange'
import { ProgressSteps } from '../../../resources/Components/ProgressSteps'
import { SidePanel } from '../../../resources/Components/SidePanel/SidePanel'
import TokenSelector from '../../../resources/Components/TokenSelector'
import {
  getTokenSelectorPage,
  INITIAL_TOKEN_SELECTOR_ROWS,
  TOKEN_SELECTOR_ROWS_INCREMENT
} from '../../../resources/Components/tokenSelectorModel'
import { createBalanceTokenSelectorItem, createDisplayBalance } from '../../../resources/domain/balance'
import { persistedImageSource } from '../../../resources/domain/image'
import {
  FLASH_LIMIT_ORDER_TYPE,
  FLASH_MARKET_ORDER_TYPE,
  FLASH_STOP_LOSS_ORDER_TYPE,
  FLASH_STOP_ORDER_TYPE,
  FLASH_TAKE_PROFIT_ORDER_TYPE,
  FLASH_TWAP_ORDER_TYPE
} from '../../../resources/domain/flash/constants'
import {
  getContraPreposition,
  getDirectionLabel,
  isSameFlashAsset
} from '../../../resources/domain/flash/pair'
import {
  type FlashAsset,
  type FlashOrderType,
  type FlashQuote
} from '../../../resources/domain/flash/schemas'
import { formatUnits, toBigInt } from '../../../resources/utils/numbers'
import { createSideTrayWalletSelector } from '../../state/selectors/sideTrayWallet'
import { useSideTraySelector } from '../../state/useAppSelector'
import { closeTrade, flashQuote, flashSubmitOrder, signTypedData, submitTransaction } from './tradeService'
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
  buildTradeQuoteRequest,
  buildTradeActionRequest,
  buildTradePermitSignatureRequest,
  buildTradeSignatureRequest,
  buildTradeSubmitRequest,
  buildVisualTradeSteps,
  canReviewTrade,
  createTradeBalanceIndex,
  formatTradeNotional,
  getFlashBalanceEntries,
  getEstimatedTradePriceImpact,
  getNextTradeAction,
  getTradePrimaryLabel,
  getTradeQuoteValidationError,
  getTradeTriggerDeltaPercent,
  getTradeValidationError,
  marketTradeQuoteRequestKey,
  tradeErrorMessage
} from './tradeTransaction'

const MARKET_QUOTE_DEBOUNCE_MS = 250
const MARKET_QUOTE_REFRESH_MS = 15_000

interface TradeProps {
  assetId?: string | null
  chainId?: number
}

function buildQuoteEffectRequest(requestInput: Parameters<typeof buildTradeQuoteRequest>[0]) {
  try {
    const request = buildTradeQuoteRequest(requestInput)

    return {
      error: '',
      request,
      requestKey: request ? marketTradeQuoteRequestKey(request) : ''
    }
  } catch (e) {
    return {
      error: tradeErrorMessage(e, 'Could not build Flash quote.'),
      request: null,
      requestKey: ''
    }
  }
}

export default function Trade({ assetId, chainId }: TradeProps) {
  const selectSideTrayWallet = React.useMemo(() => createSideTrayWalletSelector(), [])
  const { balanceSummaries, currentAccount, networks, networksMeta, runtime } =
    useSideTraySelector(selectSideTrayWallet)
  const tradeAssets = React.useMemo(
    () => buildTradeAssetOptions({ balances: balanceSummaries, networks, runtime }),
    [balanceSummaries, networks, runtime]
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
  const mountedRef = React.useRef(false)
  const latestStateRef = React.useRef(state)
  const accountAddress = currentAccount?.address || ''
  const previousAccountAddressRef = React.useRef(accountAddress)
  const inputAmount = getTradeInputAmount(state)
  const quoteEffectRequest = React.useMemo(() => {
    return buildQuoteEffectRequest({
      accountAddress,
      contraAsset: state.contraAsset,
      durationDays: state.durationDays,
      durationHours: state.durationHours,
      durationMinutes: state.durationMinutes,
      expireTime: state.expireTime,
      inputAmount,
      limitNotionalPrice: state.limitNotionalPrice,
      maxPriceImpact: state.maxPriceImpact,
      orderType: state.orderType,
      quickTrade: state.quickTrade,
      side: state.side,
      slippage: state.slippage,
      targetAsset: state.targetAsset,
      timeInForce: state.timeInForce,
      triggerNotionalPrice: state.triggerNotionalPrice,
      twapBucketCount: state.twapBucketCount
    })
  }, [
    accountAddress,
    inputAmount,
    state.contraAsset,
    state.durationDays,
    state.durationHours,
    state.durationMinutes,
    state.expireTime,
    state.limitNotionalPrice,
    state.maxPriceImpact,
    state.orderType,
    state.quickTrade,
    state.side,
    state.slippage,
    state.targetAsset,
    state.timeInForce,
    state.triggerNotionalPrice,
    state.twapBucketCount
  ])
  const latestQuoteEffectRequestRef = React.useRef(quoteEffectRequest)
  const ticketValidationError = React.useMemo(() => {
    if (!inputAmount) return ''

    return getTradeValidationError({
      ...getTradeOrderFields(state),
      inputAmount,
      orderType: state.orderType,
      side: state.side,
      slippage: state.slippage
    })
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
  const invalidTradeFields = {
    amount: ticketValidationError === 'Enter an amount to trade.',
    duration: ticketValidationError.startsWith('TWAP duration'),
    expireTime: ticketValidationError.startsWith('Choose a future expiry time'),
    limitPrice:
      ticketValidationError === 'Enter a limit price.' ||
      ticketValidationError.startsWith('Enter a valid limit price'),
    maxPriceImpact: ticketValidationError.startsWith('Max price impact'),
    slippage: ticketValidationError.startsWith('Max slippage'),
    triggerPrice: ticketValidationError === 'Enter a trigger price.' || Boolean(quoteValidationError),
    twapBucketCount: ticketValidationError.startsWith('Segments must')
  }

  React.useEffect(() => {
    mountedRef.current = true

    return () => {
      mountedRef.current = false
    }
  }, [])

  React.useEffect(() => {
    latestStateRef.current = state
  }, [state])

  React.useEffect(() => {
    latestQuoteEffectRequestRef.current = quoteEffectRequest
  }, [quoteEffectRequest])

  React.useEffect(() => {
    dispatch({ type: 'setAssetOptions', assets: tradeAssets, balances: flashBalanceEntries })
  }, [flashBalanceEntries, tradeAssets])

  React.useEffect(() => {
    if (previousAccountAddressRef.current === accountAddress) return

    previousAccountAddressRef.current = accountAddress
    dispatch({ type: 'accountChanged' })
  }, [accountAddress])

  React.useEffect(() => {
    const initialRequest = latestQuoteEffectRequestRef.current

    if (initialRequest.error) {
      dispatch({ type: 'quoteBuildFailed', error: initialRequest.error })
      return
    }

    if (!initialRequest.request || !initialRequest.requestKey) {
      dispatch({ type: 'quoteCleared' })
      return
    }

    const requestKey = initialRequest.requestKey
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const scheduleQuote = (delay: number) => {
      timer = setTimeout(() => void requestQuote(), delay)
    }

    const requestQuote = () => {
      if (cancelled) return

      const currentRequest = latestQuoteEffectRequestRef.current
      if (!currentRequest.request || currentRequest.requestKey !== requestKey) return

      const currentState = latestStateRef.current
      if (currentState.actionQuoteId || currentState.submitting) {
        scheduleQuote(MARKET_QUOTE_REFRESH_MS)
        return
      }

      dispatch({ type: 'quoteRequested', requestKey })

      void flashQuote(currentRequest.request)
        .then((result) => {
          if (
            !mountedRef.current ||
            cancelled ||
            latestQuoteEffectRequestRef.current.requestKey !== requestKey
          ) {
            return
          }

          const quote = result?.quote as FlashQuote | null

          if (!quote) {
            dispatch({
              type: 'quoteFailed',
              error: 'Flash quote did not return an order quote.',
              requestKey
            })
            return
          }

          dispatch({
            type: 'quoteSucceeded',
            flashPayload: result?.flash || quote.raw || null,
            quote,
            requestKey
          })
        })
        .catch((e) => {
          if (
            !mountedRef.current ||
            cancelled ||
            latestQuoteEffectRequestRef.current.requestKey !== requestKey
          ) {
            return
          }

          dispatch({
            type: 'quoteFailed',
            error: tradeErrorMessage(e, 'Flash quote failed.'),
            requestKey
          })
        })
        .finally(() => {
          if (
            mountedRef.current &&
            !cancelled &&
            latestQuoteEffectRequestRef.current.requestKey === requestKey
          ) {
            scheduleQuote(MARKET_QUOTE_REFRESH_MS)
          }
        })
    }

    scheduleQuote(MARKET_QUOTE_DEBOUNCE_MS)

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [quoteEffectRequest.error, quoteEffectRequest.requestKey])

  const getTradeDisplayBalance = React.useCallback(
    (asset: FlashAsset) => {
      const balance = tradeBalanceIndex.get(asset.id)
      if (!balance) return '0'

      return createDisplayBalance(balance).displayBalance
    },
    [tradeBalanceIndex]
  )

  const getTradeLogoURI = React.useCallback(
    (asset: FlashAsset) => {
      const balance = tradeBalanceIndex.get(asset.id)

      return (
        balance?.logoURI ||
        (asset.isNative ? persistedImageSource(networksMeta[asset.chainId]?.nativeCurrency?.image) : '')
      )
    },
    [networksMeta, tradeBalanceIndex]
  )

  const createTradeSelectorItem = React.useCallback(
    (asset: FlashAsset) => {
      const balance = tradeBalanceIndex.get(asset.id)

      if (balance) return { ...createBalanceTokenSelectorItem(balance), id: asset.id }

      return {
        id: asset.id,
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
      const balance = tradeBalanceIndex.get(asset.id)
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
      const balance = tradeBalanceIndex.get(asset.id)
      const displayBalance = Number(formatUnits(toBigInt(balance?.balance || 0) || 0n, asset.decimals))
      const input = Number(String(amount || '').replace(/,/g, ''))

      if (!Number.isFinite(displayBalance) || displayBalance <= 0 || !Number.isFinite(input) || input <= 0) {
        return 0
      }

      return Math.min(100, Math.max(0, (input / displayBalance) * 100))
    },
    [tradeBalanceIndex]
  )

  const submitSignedTrade = React.useCallback(
    async (
      signature: string,
      quote: FlashQuote,
      flashPayload: unknown,
      actionQuoteId: string,
      permitSignature = ''
    ) => {
      if (!accountAddress || !quote) {
        dispatch({ type: 'stepFailed', stepKind: 'submit', error: 'Flash quote is no longer available.' })
        return
      }

      const submitRequest = buildTradeSubmitRequest({
        accountAddress,
        flashPayload,
        ...getTradeOrderFields(latestStateRef.current),
        permitSignature,
        quickTrade: latestStateRef.current.quickTrade,
        quote,
        signature,
        slippage: latestStateRef.current.slippage
      })

      dispatch({ type: 'submitStarted', actionQuoteId })

      try {
        const result = await flashSubmitOrder(submitRequest)
        if (!mountedRef.current || (latestStateRef.current.quote?.id || '') !== actionQuoteId) {
          return
        }

        if (!result?.orderId) {
          dispatch({
            type: 'submitFailed',
            actionQuoteId,
            error: 'Flash order submit did not return an order id.'
          })
          return
        }

        dispatch({ type: 'submitSucceeded', actionQuoteId })
        closeTrade()
      } catch (e) {
        if (!mountedRef.current || (latestStateRef.current.quote?.id || '') !== actionQuoteId) {
          return
        }

        dispatch({
          type: 'submitFailed',
          actionQuoteId,
          error: tradeErrorMessage(e, 'Flash order submit failed.')
        })
      }
    },
    [accountAddress]
  )

  const sendTradeTransaction = React.useCallback(
    async (action: unknown, stepKind: 'wrap' | 'approve') => {
      const workflow = latestStateRef.current
      const quote = workflow.quote
      const actionQuoteId = quote?.id || ''

      try {
        const { chainId, transaction } = buildTradeActionRequest({
          accountAddress,
          action: action as any
        })

        dispatch({
          type: 'actionStarted',
          actionQuoteId,
          stepKind,
          status: 'Confirm in Newframe'
        })

        const response = await submitTransaction(chainId, transaction, crypto.randomUUID())
        if (!mountedRef.current) return

        if (!response.ok) {
          dispatch({
            type: 'actionFailed',
            actionQuoteId,
            stepKind,
            error: response.message || 'Transaction failed.'
          })
          return
        }

        dispatch({
          type: 'actionSucceeded',
          actionQuoteId,
          stepKind,
          txHash: response.transactionHash
        })
      } catch (e) {
        dispatch({
          type: 'stepFailed',
          stepKind,
          error: tradeErrorMessage(e, 'Invalid Flash transaction chain.')
        })
      }
    },
    [accountAddress]
  )

  const signAndSubmitTrade = React.useCallback(async () => {
    const workflow = latestStateRef.current
    const quote = workflow.quote
    const actionQuoteId = quote?.id || ''

    try {
      let permitSignature = ''
      const permitRequest = buildTradePermitSignatureRequest({
        accountAddress,
        flashPayload: workflow.flashPayload,
        quote
      })

      if (permitRequest) {
        dispatch({
          type: 'actionStarted',
          actionQuoteId,
          stepKind: 'sign',
          status: 'Review permit in Newframe'
        })

        const permitResponse = await signTypedData(permitRequest.chainId, permitRequest.typedData)
        if (!mountedRef.current) return

        permitSignature = permitResponse.ok ? permitResponse.signature : ''

        if (!permitResponse.ok || !permitSignature) {
          dispatch({
            type: 'actionFailed',
            actionQuoteId,
            stepKind: 'sign',
            error: !permitResponse.ok
              ? permitResponse.message || 'Permit signature was not returned.'
              : 'Permit signature was not returned.'
          })
          return
        }

        if ((latestStateRef.current.quote?.id || '') !== actionQuoteId) return
      }

      const { chainId, typedData } = buildTradeSignatureRequest({
        accountAddress,
        flashPayload: workflow.flashPayload,
        quote
      })

      dispatch({
        type: 'actionStarted',
        actionQuoteId,
        stepKind: 'sign',
        status: 'Review order in Newframe'
      })

      const response = await signTypedData(chainId, typedData)
      if (!mountedRef.current) return

      const signature = response.ok ? response.signature : ''

      if (!response.ok || !signature) {
        dispatch({
          type: 'actionFailed',
          actionQuoteId,
          stepKind: 'sign',
          error: !response.ok
            ? response.message || 'Order signature was not returned.'
            : 'Order signature was not returned.'
        })
        return
      }

      if ((latestStateRef.current.quote?.id || '') !== actionQuoteId) return

      dispatch({ type: 'signatureSucceeded', actionQuoteId, signature })
      await submitSignedTrade(
        signature,
        quote as FlashQuote,
        workflow.flashPayload,
        actionQuoteId,
        permitSignature
      )
    } catch (e) {
      dispatch({
        type: 'stepFailed',
        stepKind: 'sign',
        error: tradeErrorMessage(e, 'Invalid Flash signature chain.')
      })
    }
  }, [accountAddress, submitSignedTrade])

  const reviewTrade = React.useCallback(() => {
    const quote = latestStateRef.current.quote
    const nextAction = getNextTradeAction({
      orderType: latestStateRef.current.orderType,
      quote
    })

    if (!quote) return
    if (nextAction === 'wrap') void sendTradeTransaction(quote.actions?.wrap, 'wrap')
    if (nextAction === 'approve') void sendTradeTransaction(quote.actions?.approval, 'approve')
    if (nextAction === 'sign') void signAndSubmitTrade()
  }, [sendTradeTransaction, signAndSubmitTrade])

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
    field:
      | 'durationDays'
      | 'durationHours'
      | 'durationMinutes'
      | 'limitNotionalPrice'
      | 'maxPriceImpact'
      | 'triggerNotionalPrice'
      | 'twapBucketCount'
    inputMode?: 'decimal' | 'numeric'
    invalid?: boolean
    label: string
    placeholder: string
    required?: boolean
    suffix?: string
    vertical?: boolean
  }) => {
    return (
      <Field invalid={invalid} label={label} required={required} suffix={suffix} vertical={vertical}>
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
              {renderOrderInput({
                ariaLabel: 'TWAP duration days',
                field: 'durationDays',
                inputMode: 'numeric',
                invalid: invalidTradeFields.duration,
                label: 'Days',
                placeholder: '0',
                vertical: true
              })}
              {renderOrderInput({
                ariaLabel: 'TWAP duration hours',
                field: 'durationHours',
                inputMode: 'numeric',
                invalid: invalidTradeFields.duration,
                label: 'Hours',
                placeholder: '1',
                vertical: true
              })}
              {renderOrderInput({
                ariaLabel: 'TWAP duration minutes',
                field: 'durationMinutes',
                inputMode: 'numeric',
                invalid: invalidTradeFields.duration,
                label: 'Minutes',
                placeholder: '0',
                vertical: true
              })}
            </Grid>
            <Text variant='detail' tone='secondary'>
              Minimum 5 minutes · Maximum 30 days
            </Text>
          </Stack>
        </Surface>
      )
    }

    if ([FLASH_STOP_LOSS_ORDER_TYPE, FLASH_TAKE_PROFIT_ORDER_TYPE].includes(state.orderType)) {
      const takeProfit = state.orderType === FLASH_TAKE_PROFIT_ORDER_TYPE
      const delta = getTradeTriggerDeltaPercent(state.triggerNotionalPrice, state.quote?.targetNotionalPrice)

      return (
        <Surface border='subtle' padding='medium' radius='small' tone='card'>
          <Stack gap='medium'>
            <Group label='TP or SL'>
              <Surface padding='small' radius='small' tone='subtle'>
                <Grid columns='two' gap='small'>
                  <ToggleButton
                    onPress={() =>
                      dispatch({ type: 'setOrderType', orderType: FLASH_TAKE_PROFIT_ORDER_TYPE })
                    }
                    pressed={takeProfit}
                    size='small'
                  >
                    <Text align='center' variant='supporting'>
                      Take profit
                    </Text>
                  </ToggleButton>
                  <ToggleButton
                    onPress={() => dispatch({ type: 'setOrderType', orderType: FLASH_STOP_LOSS_ORDER_TYPE })}
                    pressed={!takeProfit}
                    size='small'
                  >
                    <Text align='center' variant='supporting'>
                      Stop loss
                    </Text>
                  </ToggleButton>
                </Grid>
              </Surface>
            </Group>
            <Grid columns='three' gap='medium' responsive>
              {renderOrderInput({
                ariaLabel: takeProfit ? 'Take-profit trigger price' : 'Stop-loss trigger price',
                field: 'triggerNotionalPrice',
                invalid: invalidTradeFields.triggerPrice,
                label: `${takeProfit ? 'TP' : 'SL'} trigger`,
                placeholder: '0.00',
                required: true,
                suffix: 'USD',
                vertical: true
              })}
              {renderOrderInput({
                ariaLabel: takeProfit ? 'Take-profit limit price' : 'Stop-loss limit price',
                field: 'limitNotionalPrice',
                invalid: invalidTradeFields.limitPrice,
                label: `${takeProfit ? 'TP' : 'SL'} limit`,
                placeholder: 'Market',
                suffix: 'USD',
                vertical: true
              })}
              <Field label={takeProfit ? 'Gain' : 'Loss'} vertical>
                <Text as='output' align='end' variant='numeric'>
                  {delta === null ? '—' : `${delta >= 0 ? '+' : ''}${delta.toFixed(2)}%`}
                </Text>
              </Field>
            </Grid>
            <Text variant='detail' tone='secondary'>
              {delta === null
                ? `Quoted against ${state.targetAsset.symbol}/USD`
                : `${delta >= 0 ? '+' : ''}${delta.toFixed(2)}% from current price`}
            </Text>
          </Stack>
        </Surface>
      )
    }

    if (state.orderType === FLASH_STOP_ORDER_TYPE) {
      const delta = getTradeTriggerDeltaPercent(state.triggerNotionalPrice, state.quote?.targetNotionalPrice)

      return (
        <Surface border='subtle' padding='medium' radius='small' tone='card'>
          <Stack gap='medium'>
            <Grid columns='two' gap='medium' responsive>
              {renderOrderInput({
                ariaLabel: 'Stop trigger price',
                field: 'triggerNotionalPrice',
                invalid: invalidTradeFields.triggerPrice,
                label: `${state.targetAsset.symbol}/USD trigger`,
                placeholder: '0.00',
                required: true,
                suffix: 'USD',
                vertical: true
              })}
              {renderOrderInput({
                ariaLabel: 'Stop limit price',
                field: 'limitNotionalPrice',
                invalid: invalidTradeFields.limitPrice,
                label: 'Limit price',
                placeholder: 'Market',
                suffix: 'USD',
                vertical: true
              })}
            </Grid>
            <Text variant='detail' tone='secondary'>
              {delta === null
                ? 'Leave limit blank for a stop-market order'
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
        const localExpiry = new Date(expiry.getTime() - expiry.getTimezoneOffset() * 60_000)
          .toISOString()
          .slice(0, 16)
        dispatch({ type: 'setOrderField', field: 'expireTime', value: localExpiry })
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
              min={new Date().toISOString().slice(0, 16)}
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
      getId: (option) => option.id,
      items: options,
      open,
      rowsVisible: assetRowsVisible[field],
      selectedId: asset.id
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
          const selected = options.find((option) => option.id === id)
          if (selected) dispatch({ type: 'selectAsset', field, asset: selected })
        }}
        open={open}
        selectedId={asset.id}
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
    const steps = state.quote?.steps || buildVisualTradeSteps(spentAsset, state.orderType, false)

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
    const enabled = canReviewTrade({
      orderType: state.orderType,
      pendingAction: state.pendingAction,
      quote: state.quote,
      quoteLoading: state.quoteLoading,
      submitting: state.submitting,
      validationError: tradeValidationError
    })

    return (
      <Stack grow>
        <Button appearance='primary' disabled={!enabled} onPress={reviewTrade} size='large'>
          <Text align='center' variant='action' tone='inverse'>
            {tradeValidationError && state.quote
              ? 'Adjust order'
              : getTradePrimaryLabel({
                  orderType: state.orderType,
                  pendingAction: state.pendingAction,
                  quote: state.quote,
                  quoteLoading: state.quoteLoading,
                  submitting: state.submitting
                })}
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
      onClose={closeTrade}
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
        {state.error || tradeValidationError ? (
          <Text align='center' variant='body' tone='danger'>
            {state.error || tradeValidationError}
          </Text>
        ) : null}
        {state.status ? (
          <Text align='center' variant='body' tone='secondary'>
            {state.status}
          </Text>
        ) : null}
        <Spacer />
        {renderTradeSteps()}
      </Stack>
    </SidePanel>
  )
}
