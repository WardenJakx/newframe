import React from 'react'

import TokenSelector from '../../../resources/Components/TokenSelector'
import {
  getTokenSelectorPage,
  INITIAL_TOKEN_SELECTOR_ROWS,
  TOKEN_SELECTOR_ROWS_INCREMENT
} from '../../../resources/Components/tokenSelectorModel'
import { createBalanceTokenSelectorItem, createDisplayBalance } from '../../../resources/domain/balance'
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
  type FlashQuote,
  type FlashStep
} from '../../../resources/domain/flash/schemas'
import svg from '../../../resources/svg'
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
    state.contraAsset.id,
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
    state.targetAsset.id,
    state.timeInForce,
    state.triggerNotionalPrice,
    state.twapBucketCount
  ])
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
    dispatch({ type: 'setAssetOptions', assets: tradeAssets, balances: flashBalanceEntries })
  }, [flashBalanceEntries, tradeAssets])

  React.useEffect(() => {
    if (previousAccountAddressRef.current === accountAddress) return

    previousAccountAddressRef.current = accountAddress
    dispatch({ type: 'accountChanged' })
  }, [accountAddress])

  React.useEffect(() => {
    if (quoteEffectRequest.error) {
      dispatch({ type: 'quoteBuildFailed', error: quoteEffectRequest.error })
      return
    }

    if (!quoteEffectRequest.request || !quoteEffectRequest.requestKey) {
      dispatch({ type: 'quoteCleared' })
      return
    }

    dispatch({ type: 'quoteRequested', requestKey: quoteEffectRequest.requestKey })

    const timer = setTimeout(() => {
      void flashQuote(quoteEffectRequest.request!)
        .then((result) => {
          if (!mountedRef.current) return

          const quote = result?.quote as FlashQuote | null

          if (!quote) {
            dispatch({
              type: 'quoteFailed',
              error: 'Flash quote did not return an order quote.',
              requestKey: quoteEffectRequest.requestKey
            })
            return
          }

          dispatch({
            type: 'quoteSucceeded',
            flashPayload: result?.flash || quote.raw || null,
            quote,
            requestKey: quoteEffectRequest.requestKey
          })
        })
        .catch((e) => {
          if (!mountedRef.current) return

          dispatch({
            type: 'quoteFailed',
            error: tradeErrorMessage(e, 'Flash quote failed.'),
            requestKey: quoteEffectRequest.requestKey
          })
        })
    }, MARKET_QUOTE_DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [quoteEffectRequest])

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
        balance?.logoURI || (asset.isNative ? networksMeta[asset.chainId]?.nativeCurrency?.icon || '' : '')
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
      <div className='tradeTabsWrap'>
        <div aria-label='Order type' className='tradeTabs' role='tablist'>
          {tabs.map((tab) => (
            <button
              aria-selected={tab.active}
              className={tab.active ? 'tradeTab tradeTabActive' : 'tradeTab'}
              key={tab.label}
              onClick={() => dispatch({ type: 'setOrderType', orderType: tab.orderType })}
              role='tab'
              type='button'
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
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
    suffix
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
  }) => {
    return (
      <label className={invalid ? 'tradeOrderField tradeOrderFieldInvalid' : 'tradeOrderField'}>
        <span className='tradeOrderFieldLabel'>
          {label}
          {required ? (
            <span aria-hidden='true' className='tradeRequiredMark'>
              *
            </span>
          ) : null}
        </span>
        <span className='tradeOrderFieldControl'>
          <input
            aria-invalid={invalid || undefined}
            aria-label={ariaLabel}
            aria-required={required || undefined}
            inputMode={inputMode}
            onChange={(e) => dispatch({ type: 'setOrderField', field, value: e.target.value })}
            placeholder={placeholder}
            required={required}
            value={state[field]}
          />
          {suffix ? <span className='tradeOrderFieldSuffix'>{suffix}</span> : null}
        </span>
      </label>
    )
  }

  const renderTradeOrderFields = () => {
    if (state.orderType === FLASH_MARKET_ORDER_TYPE) return null

    if (state.orderType === FLASH_LIMIT_ORDER_TYPE) {
      return (
        <div className='tradeOrderFields'>
          {renderOrderInput({
            ariaLabel: 'Limit price',
            field: 'limitNotionalPrice',
            invalid: invalidTradeFields.limitPrice,
            label: `${state.targetAsset.symbol}/USD limit`,
            placeholder: '0.00',
            required: true,
            suffix: 'USD'
          })}
        </div>
      )
    }

    if (state.orderType === FLASH_TWAP_ORDER_TYPE) {
      return (
        <div className='tradeOrderSection'>
          <div className='tradeOrderSectionTitle'>
            Duration
            <span aria-hidden='true' className='tradeRequiredMark'>
              *
            </span>
          </div>
          <div className='tradeOrderFields tradeOrderFieldsThree'>
            {renderOrderInput({
              ariaLabel: 'TWAP duration days',
              field: 'durationDays',
              inputMode: 'numeric',
              invalid: invalidTradeFields.duration,
              label: 'Days',
              placeholder: '0'
            })}
            {renderOrderInput({
              ariaLabel: 'TWAP duration hours',
              field: 'durationHours',
              inputMode: 'numeric',
              invalid: invalidTradeFields.duration,
              label: 'Hours',
              placeholder: '1'
            })}
            {renderOrderInput({
              ariaLabel: 'TWAP duration minutes',
              field: 'durationMinutes',
              inputMode: 'numeric',
              invalid: invalidTradeFields.duration,
              label: 'Minutes',
              placeholder: '0'
            })}
          </div>
          <div className='tradeOrderHint'>Minimum 5 minutes · Maximum 30 days</div>
        </div>
      )
    }

    if ([FLASH_STOP_LOSS_ORDER_TYPE, FLASH_TAKE_PROFIT_ORDER_TYPE].includes(state.orderType)) {
      const takeProfit = state.orderType === FLASH_TAKE_PROFIT_ORDER_TYPE
      const delta = getTradeTriggerDeltaPercent(state.triggerNotionalPrice, state.quote?.targetNotionalPrice)

      return (
        <div className='tradeOrderSection'>
          <div aria-label='TP or SL' className='tradeTriggerKind' role='group'>
            <button
              className={takeProfit ? 'tradeTriggerKindActive' : ''}
              onClick={() => dispatch({ type: 'setOrderType', orderType: FLASH_TAKE_PROFIT_ORDER_TYPE })}
              type='button'
            >
              Take profit
            </button>
            <button
              className={!takeProfit ? 'tradeTriggerKindActive' : ''}
              onClick={() => dispatch({ type: 'setOrderType', orderType: FLASH_STOP_LOSS_ORDER_TYPE })}
              type='button'
            >
              Stop loss
            </button>
          </div>
          <div className='tradeOrderFields tradeOrderFieldsThree tradeOrderFieldsTrigger'>
            {renderOrderInput({
              ariaLabel: takeProfit ? 'Take-profit trigger price' : 'Stop-loss trigger price',
              field: 'triggerNotionalPrice',
              invalid: invalidTradeFields.triggerPrice,
              label: `${takeProfit ? 'TP' : 'SL'} trigger`,
              placeholder: '0.00',
              required: true,
              suffix: 'USD'
            })}
            {renderOrderInput({
              ariaLabel: takeProfit ? 'Take-profit limit price' : 'Stop-loss limit price',
              field: 'limitNotionalPrice',
              invalid: invalidTradeFields.limitPrice,
              label: `${takeProfit ? 'TP' : 'SL'} limit`,
              placeholder: 'Market',
              suffix: 'USD'
            })}
            <label className='tradeOrderField'>
              <span className='tradeOrderFieldLabel'>{takeProfit ? 'Gain' : 'Loss'}</span>
              <output className='tradeOrderOutput'>
                {delta === null ? '—' : `${delta >= 0 ? '+' : ''}${delta.toFixed(2)}%`}
              </output>
            </label>
          </div>
          <div className='tradeOrderHint'>
            {delta === null
              ? `Quoted against ${state.targetAsset.symbol}/USD`
              : `${delta >= 0 ? '+' : ''}${delta.toFixed(2)}% from current price`}
          </div>
        </div>
      )
    }

    if (state.orderType === FLASH_STOP_ORDER_TYPE) {
      const delta = getTradeTriggerDeltaPercent(state.triggerNotionalPrice, state.quote?.targetNotionalPrice)

      return (
        <div className='tradeOrderSection'>
          <div className='tradeOrderFields tradeOrderFieldsTwo tradeOrderFieldsTrigger'>
            {renderOrderInput({
              ariaLabel: 'Stop trigger price',
              field: 'triggerNotionalPrice',
              invalid: invalidTradeFields.triggerPrice,
              label: `${state.targetAsset.symbol}/USD trigger`,
              placeholder: '0.00',
              required: true,
              suffix: 'USD'
            })}
            {renderOrderInput({
              ariaLabel: 'Stop limit price',
              field: 'limitNotionalPrice',
              invalid: invalidTradeFields.limitPrice,
              label: 'Limit price',
              placeholder: 'Market',
              suffix: 'USD'
            })}
          </div>
          <div className='tradeOrderHint'>
            {delta === null
              ? 'Leave limit blank for a stop-market order'
              : `${delta >= 0 ? '+' : ''}${delta.toFixed(2)}% from current price`}
          </div>
        </div>
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
      <div className='tradeSettingStack'>
        <label className='tradeSettingRow'>
          <span>
            Time in force
            <span aria-hidden='true' className='tradeRequiredMark'>
              *
            </span>
          </span>
          <select
            aria-label='Time in force'
            onChange={(e) => handleTimeInForceChange(e.target.value as 'gtc' | 'gtt')}
            value={state.timeInForce}
          >
            <option value='gtc'>Good till cancelled</option>
            <option value='gtt'>Good till time</option>
          </select>
        </label>
        {state.timeInForce === 'gtt' ? (
          <label className='tradeSettingRow'>
            <span>
              Expires
              <span aria-hidden='true' className='tradeRequiredMark'>
                *
              </span>
            </span>
            <input
              aria-invalid={invalidTradeFields.expireTime || undefined}
              aria-label='Order expiry'
              aria-required='true'
              className={invalidTradeFields.expireTime ? 'tradeSettingInputInvalid' : undefined}
              min={new Date().toISOString().slice(0, 16)}
              onChange={(e) =>
                dispatch({ type: 'setOrderField', field: 'expireTime', value: e.target.value })
              }
              required
              type='datetime-local'
              value={state.expireTime}
            />
          </label>
        ) : null}
      </div>
    )
  }

  const renderTradeAdvancedFields = () => {
    if (state.orderType === FLASH_MARKET_ORDER_TYPE) {
      return (
        <label className='tradeSettingRow'>
          <span>Max slippage</span>
          <div
            className={
              invalidTradeFields.slippage
                ? 'tradeSlippageInput tradeSlippageInputInvalid'
                : 'tradeSlippageInput'
            }
          >
            <input
              aria-invalid={invalidTradeFields.slippage || undefined}
              aria-label='Slippage'
              inputMode='decimal'
              onChange={(e) => dispatch({ type: 'settingsChanged', slippage: e.target.value })}
              placeholder='Automatic'
              value={state.slippage}
            />
            <span>%</span>
          </div>
        </label>
      )
    }

    if (state.orderType === FLASH_TWAP_ORDER_TYPE) {
      return (
        <div className='tradeSettingStack'>
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
        </div>
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

    return (
      <TokenSelector
        ariaLabel={`Select ${field} asset`}
        footer={
          rowsHidden > 0 ? (
            <button
              className='tokenSelectorMore'
              onClick={() =>
                setAssetRowsVisible((rows) => ({
                  ...rows,
                  [field]: rows[field] + TOKEN_SELECTOR_ROWS_INCREMENT
                }))
              }
              type='button'
            >
              {`Show ${Math.min(TOKEN_SELECTOR_ROWS_INCREMENT, rowsHidden)} more assets`}
            </button>
          ) : null
        }
        items={items}
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
      <button
        aria-label={`Switch to ${nextSide}`}
        className='tradeDirectionSwitch'
        onClick={() => dispatch({ type: 'toggleSide' })}
        title={`Switch to ${nextSide}`}
        type='button'
      >
        <svg aria-hidden='true' viewBox='0 0 20 20'>
          <path d='M4 5.5h10.2l-2-2L13.7 2 18 6.25l-4.3 4.25-1.5-1.5 2-2H4z' />
          <path d='M16 14.5H5.8l2 2L6.3 18 2 13.75 6.3 9.5 7.8 11l-2 2H16z' />
        </svg>
      </button>
    )
  }

  const renderTradeBalanceSlider = (asset: FlashAsset, amount: string) => {
    const percent = getTradeBalancePercent(asset, amount)

    return (
      <div
        className={
          state.side === 'buy'
            ? 'tradeBalanceSlider tradeBalanceSliderBuy'
            : 'tradeBalanceSlider tradeBalanceSliderSell'
        }
      >
        <div className='tradeBalanceSliderHeader'>
          <span>
            Balance {getTradeDisplayBalance(asset)} {asset.symbol}
          </span>
          <label>
            <input
              aria-label={`${asset.symbol} balance percentage`}
              inputMode='decimal'
              max='100'
              min='0'
              onChange={(e) => handleSetTradeBalancePercent(asset, Number(e.target.value))}
              type='number'
              value={Number(percent.toFixed(2))}
            />
            <span>%</span>
          </label>
        </div>
        <input
          aria-label={`${asset.symbol} amount percentage`}
          className='tradeBalanceRange'
          data-direction={state.side}
          max='100'
          min='0'
          onChange={(e) => handleSetTradeBalancePercent(asset, Number(e.target.value))}
          step='0.1'
          type='range'
          value={percent}
        />
        <div aria-hidden='true' className='tradeBalanceTicks'>
          <span>0%</span>
          <span>25%</span>
          <span>50%</span>
          <span>75%</span>
          <span>100%</span>
        </div>
      </div>
    )
  }

  const renderTradeAssetCard = (field: TradeAssetField) => {
    const asset = field === 'target' ? state.targetAsset : state.contraAsset
    const oppositeAsset = field === 'target' ? state.contraAsset : state.targetAsset
    const amount = field === 'target' ? state.targetAmount : state.contraAmount
    const isTarget = field === 'target'
    const editable = state.side === 'buy' ? field === 'contra' : field === 'target'
    const intent = isTarget ? getDirectionLabel(state.side) : getContraPreposition(state.side).toUpperCase()
    const intentClass = isTarget
      ? state.side === 'buy'
        ? 'tradeIntentLine tradeIntentBuy'
        : 'tradeIntentLine tradeIntentSell'
      : 'tradeIntentLine'
    const sideLocked = [
      FLASH_STOP_ORDER_TYPE,
      FLASH_STOP_LOSS_ORDER_TYPE,
      FLASH_TAKE_PROFIT_ORDER_TYPE
    ].includes(state.orderType)

    const assetCardClassName = [
      'tradeAssetCard',
      editable ? 'tradeAssetCardEditable' : '',
      editable && state.side === 'buy' ? 'tradeAssetCardEditableBuy' : '',
      editable && state.side === 'sell' ? 'tradeAssetCardEditableSell' : '',
      editable && invalidTradeFields.amount ? 'tradeAssetCardInvalid' : ''
    ]
      .filter(Boolean)
      .join(' ')

    return (
      <div className={assetCardClassName}>
        <div className='tradeAssetCardHeader'>
          <div className={intentClass}>
            <span>{intent}</span>
            {isTarget && !sideLocked ? renderTradeDirectionSwitch() : null}
          </div>
        </div>
        <div className='tradeAssetAmountRow'>
          {renderTradeAssetSelector(field, asset, oppositeAsset)}
          <input
            aria-label={editable ? `${asset.symbol} amount` : `Estimated ${asset.symbol} received`}
            className='tradeAmountInput'
            inputMode='decimal'
            onChange={
              editable ? (e) => dispatch({ type: 'setInputAmount', inputAmount: e.target.value }) : undefined
            }
            placeholder='0'
            readOnly={!editable}
            spellCheck='false'
            value={amount}
          />
        </div>
        {editable ? (
          renderTradeBalanceSlider(asset, amount)
        ) : (
          <div className='tradeOutputNote'>
            <span>Est. received</span>
            {state.quote?.outputNotional ? (
              <strong>~{formatTradeNotional(state.quote.outputNotional)}</strong>
            ) : null}
          </div>
        )}
      </div>
    )
  }

  const renderTradeQuoteMeta = () => {
    const quote = state.quote
    if (!quote) return null

    const estimatedImpact = getEstimatedTradePriceImpact(quote)
    const feeNotional = quote.estimatedFeeNotional

    return (
      <div className='tradeQuoteSummary'>
        <div className='tradeQuoteOutput'>
          <div>
            <span>Est. output</span>
            <small>Including estimated fees</small>
          </div>
          <div>
            <strong>
              {quote.outputAmount} {quote.receiveAsset.symbol}
            </strong>
            <small>~{formatTradeNotional(quote.outputNotional)}</small>
          </div>
        </div>
        <div className='tradeQuoteRows'>
          <div>
            <span>Est. price impact</span>
            <strong className={estimatedImpact !== null && estimatedImpact > 1 ? 'tradeQuoteWarning' : ''}>
              {estimatedImpact === null ? '—' : `${estimatedImpact.toFixed(2)}%`}
            </strong>
          </div>
          <div>
            <span>Estimated fees</span>
            <strong>{feeNotional ? formatTradeNotional(feeNotional) : '—'}</strong>
          </div>
          {quote.targetNotionalPrice ? (
            <div>
              <span>{quote.targetAsset.symbol}/USD</span>
              <strong>{formatTradeNotional(quote.targetNotionalPrice)}</strong>
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  const renderTradeSteps = () => {
    const spentAsset = getTradeSpentAsset(state)
    const steps = state.quote?.steps || buildVisualTradeSteps(spentAsset, state.orderType, false)

    return (
      <div className='tradeStepTracker'>
        {steps.map((step: FlashStep, index: number) => (
          <div className={`tradeStep tradeStep${step.status}`} key={step.id}>
            <div className='tradeStepDot'>{index + 1}</div>
            <span>{step.label}</span>
          </div>
        ))}
      </div>
    )
  }

  const renderTradeAdvanced = () => {
    return (
      <div className='tradeAdvanced'>
        <button
          className='tradeAdvancedToggle'
          onClick={() => dispatch({ type: 'toggleAdvancedOpen' })}
          type='button'
        >
          <span>{svg.settings(13)}</span>
          <span>Advanced</span>
          <div
            className={
              state.advancedOpen ? 'tradeAdvancedChevron tradeAdvancedChevronOpen' : 'tradeAdvancedChevron'
            }
          >
            {svg.chevron(11)}
          </div>
        </button>
        {state.advancedOpen ? <div className='tradeAdvancedPanel'>{renderTradeAdvancedFields()}</div> : null}
      </div>
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
      <div className='tradeFooter'>
        <button
          className={enabled ? 'tradePrimaryButton' : 'tradePrimaryButton tradePrimaryButtonDisabled'}
          disabled={!enabled}
          onClick={reviewTrade}
          type='button'
        >
          {tradeValidationError && state.quote
            ? 'Adjust order'
            : getTradePrimaryLabel({
                orderType: state.orderType,
                pendingAction: state.pendingAction,
                quote: state.quote,
                quoteLoading: state.quoteLoading,
                submitting: state.submitting
              })}
        </button>
      </div>
    )
  }

  return (
    <div className='tradeApp'>
      <div className='sendHeader'>
        <button aria-label='Close Trade' className='sendBackButton' onClick={closeTrade}>
          {svg.chevronLeft(18)}
        </button>
        <div className='sendTitle'>Trade</div>
        <div className='sendHeaderSpacer' />
      </div>
      <div className='tradeBody'>
        <div className='tradeTicket'>
          {renderTradeTabs()}
          {renderTradeAssetCard('target')}
          {renderTradeAssetCard('contra')}
          {renderTradeOrderFields()}
          {renderTradeAdvanced()}
        </div>
        {renderTradeQuoteMeta()}
        {state.error || tradeValidationError ? (
          <div className='sendMessage sendMessageError'>{state.error || tradeValidationError}</div>
        ) : null}
        {state.status ? <div className='sendMessage'>{state.status}</div> : null}
        {renderTradeSteps()}
      </div>
      {renderTradeFooter()}
    </div>
  )
}
