import React from 'react'

import TokenSelector from '../../../resources/Components/TokenSelector'
import {
  getTokenSelectorPage,
  INITIAL_TOKEN_SELECTOR_ROWS,
  TOKEN_SELECTOR_ROWS_INCREMENT
} from '../../../resources/Components/tokenSelectorModel'
import { createBalanceTokenSelectorItem, createDisplayBalance } from '../../../resources/domain/balance'
import {
  FLASH_BRACKET_ORDER_TYPE,
  FLASH_LIMIT_ORDER_TYPE,
  FLASH_MARKET_ORDER_TYPE,
  FLASH_STOP_LOSS_ORDER_TYPE,
  FLASH_STOP_ORDER_TYPE,
  FLASH_TAKE_PROFIT_ORDER_TYPE,
  FLASH_TWAP_ORDER_TYPE,
  getContraPreposition,
  getDirectionLabel,
  type FlashAsset,
  type FlashOrderType,
  type FlashQuote,
  type FlashStep
} from '../../../resources/domain/flash'
import svg from '../../../resources/svg'
import { formatUnits, toBigInt } from '../../../resources/utils/numbers'
import { createDappWalletSelector } from '../../state/selectors/dappWallet'
import { useAppSelector } from '../../state/useAppSelector'
import { closeTrade, flashQuote, flashSubmitOrder, initTradeOrigin, providerSend } from './tradeService'
import {
  createInitialTradeState,
  getTradeOrderFields,
  getTradeInputAmount,
  getTradeSpentAsset,
  tradeReducer,
  type TradeAssetField,
  type TradeWorkflowState
} from './tradeReducer'
import {
  buildTradeAssetOptions,
  buildTradeQuoteRequest,
  buildTradeActionPayload,
  buildTradeSignaturePayload,
  buildTradeSubmitRequest,
  buildVisualTradeSteps,
  canReviewTrade,
  createTradeBalanceIndex,
  getFlashBalanceEntries,
  getNextTradeAction,
  getTradePrimaryLabel,
  isSameFlashAsset,
  marketTradeQuoteRequestKey,
  objectRecord,
  providerResponseError,
  tradeErrorMessage,
  TRADE_LIMIT_ORDER_TYPES,
  TRADE_ORDER_LABELS
} from './tradeTransaction'

const MARKET_QUOTE_DEBOUNCE_MS = 250

interface TradeProps {
  assetId?: string | null
  chainId?: number
}

function buildQuoteEffectRequest({
  accountAddress,
  state
}: {
  accountAddress: string
  state: TradeWorkflowState
}) {
  try {
    const request = buildTradeQuoteRequest({
      accountAddress,
      contraAsset: state.contraAsset,
      ...getTradeOrderFields(state),
      inputAmount: getTradeInputAmount(state),
      orderType: state.orderType,
      quickTrade: state.quickTrade,
      side: state.side,
      slippage: state.slippage,
      targetAsset: state.targetAsset
    })

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
  const selectDappWallet = React.useMemo(() => createDappWalletSelector(), [])
  const { balanceSummaries, currentAccount, networks, networksMeta, runtime } =
    useAppSelector(selectDappWallet)
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
    return buildQuoteEffectRequest({ accountAddress, state })
  }, [
    accountAddress,
    inputAmount,
    state.contraAsset,
    state.durationSeconds,
    state.limitNotionalPrice,
    state.orderType,
    state.quickTrade,
    state.side,
    state.slippage,
    state.stopLossNotionalPrice,
    state.takeProfitNotionalPrice,
    state.targetAsset,
    state.triggerNotionalPrice,
    state.twapBucketCount
  ])

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

  const handleSetTradeBalanceAmount = React.useCallback(
    (asset: FlashAsset, portion: 'half' | 'max') => {
      const balance = tradeBalanceIndex.get(asset.id)
      const rawBalance = toBigInt(balance?.balance || 0) || 0n
      const amount = portion === 'half' ? rawBalance / 2n : rawBalance

      dispatch({ type: 'setInputAmount', inputAmount: formatUnits(amount, asset.decimals) })
    },
    [tradeBalanceIndex]
  )

  const submitSignedTrade = React.useCallback(
    async (signature: string, quote: FlashQuote, flashPayload: unknown, actionQuoteId: string) => {
      if (!accountAddress || !quote) {
        dispatch({ type: 'stepFailed', stepKind: 'submit', error: 'Flash quote is no longer available.' })
        return
      }

      const submitRequest = buildTradeSubmitRequest({
        accountAddress,
        flashPayload,
        ...getTradeOrderFields(latestStateRef.current),
        quickTrade: latestStateRef.current.quickTrade,
        quote,
        signature,
        slippage: latestStateRef.current.slippage
      })

      dispatch({ type: 'submitStarted', actionQuoteId })

      try {
        const result = await flashSubmitOrder(submitRequest)
        if (!mountedRef.current || latestStateRef.current.actionQuoteId !== actionQuoteId) return

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
        if (!mountedRef.current || latestStateRef.current.actionQuoteId !== actionQuoteId) return

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
        const { chainIdNumber, payload } = buildTradeActionPayload({
          accountAddress,
          action: action as any
        })

        initTradeOrigin(chainIdNumber)
        dispatch({
          type: 'actionStarted',
          actionQuoteId,
          stepKind,
          status: 'Confirm in Newframe'
        })

        const response = await providerSend(payload)
        if (!mountedRef.current) return

        const error = providerResponseError(response)

        if (error) {
          dispatch({ type: 'actionFailed', actionQuoteId, stepKind, error })
          return
        }

        dispatch({
          type: 'actionSucceeded',
          actionQuoteId,
          stepKind,
          txHash: objectRecord(response).result
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
      const { chainIdNumber, payload } = buildTradeSignaturePayload({
        accountAddress,
        flashPayload: workflow.flashPayload,
        quote
      })

      initTradeOrigin(chainIdNumber)
      dispatch({
        type: 'actionStarted',
        actionQuoteId,
        stepKind: 'sign',
        status: 'Review signature in Newframe'
      })

      const response = await providerSend(payload)
      if (!mountedRef.current) return

      const error = providerResponseError(response)
      const signature = objectRecord(response).result

      if (error || !signature) {
        dispatch({
          type: 'actionFailed',
          actionQuoteId,
          stepKind: 'sign',
          error: error || 'Order signature was not returned.'
        })
        return
      }

      if (latestStateRef.current.actionQuoteId !== actionQuoteId) return

      dispatch({ type: 'signatureSucceeded', actionQuoteId, signature })
      await submitSignedTrade(signature, quote as FlashQuote, workflow.flashPayload, actionQuoteId)
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
    const activeTab =
      orderType === FLASH_MARKET_ORDER_TYPE
        ? 'market'
        : orderType === FLASH_TWAP_ORDER_TYPE
          ? 'twap'
          : 'limit'

    return (
      <div className='tradeTabsWrap'>
        <div aria-label='Order type' className='tradeTabs' role='tablist'>
          <button
            aria-selected={activeTab === 'market'}
            className={activeTab === 'market' ? 'tradeTab tradeTabActive' : 'tradeTab'}
            onClick={() => dispatch({ type: 'setOrderType', orderType: FLASH_MARKET_ORDER_TYPE })}
            role='tab'
            type='button'
          >
            Market
          </button>
          <button
            aria-selected={activeTab === 'limit'}
            className={activeTab === 'limit' ? 'tradeTab tradeTabActive' : 'tradeTab'}
            onClick={() => dispatch({ type: 'setOrderType', orderType: FLASH_LIMIT_ORDER_TYPE })}
            role='tab'
            type='button'
          >
            Limit
          </button>
          <button
            aria-selected={activeTab === 'twap'}
            className={activeTab === 'twap' ? 'tradeTab tradeTabActive' : 'tradeTab'}
            onClick={() => dispatch({ type: 'setOrderType', orderType: FLASH_TWAP_ORDER_TYPE })}
            role='tab'
            type='button'
          >
            TWAP
          </button>
        </div>
        {activeTab === 'limit' ? (
          <div className='tradeLimitSelectRow'>
            <select
              aria-label='Limit order type'
              className='tradeLimitSelect'
              onChange={(e) =>
                dispatch({ type: 'setOrderType', orderType: e.target.value as FlashOrderType })
              }
              value={orderType}
            >
              {TRADE_LIMIT_ORDER_TYPES.map((type) => (
                <option key={type} value={type}>
                  {TRADE_ORDER_LABELS[type]}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>
    )
  }

  const renderOrderInput = ({
    ariaLabel,
    field,
    inputMode = 'decimal',
    label,
    placeholder
  }: {
    ariaLabel: string
    field:
      | 'durationSeconds'
      | 'limitNotionalPrice'
      | 'stopLossNotionalPrice'
      | 'takeProfitNotionalPrice'
      | 'triggerNotionalPrice'
      | 'twapBucketCount'
    inputMode?: 'decimal' | 'numeric'
    label: string
    placeholder: string
  }) => {
    return (
      <label className='tradeOrderField'>
        <span>{label}</span>
        <input
          aria-label={ariaLabel}
          inputMode={inputMode}
          onChange={(e) => dispatch({ type: 'setOrderField', field, value: e.target.value })}
          placeholder={placeholder}
          value={state[field]}
        />
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
            label: 'Limit price',
            placeholder: '0'
          })}
        </div>
      )
    }

    if (
      [FLASH_STOP_ORDER_TYPE, FLASH_STOP_LOSS_ORDER_TYPE, FLASH_TAKE_PROFIT_ORDER_TYPE].includes(
        state.orderType
      )
    ) {
      return (
        <div className='tradeOrderFields'>
          {renderOrderInput({
            ariaLabel: 'Trigger price',
            field: 'triggerNotionalPrice',
            label: 'Trigger price',
            placeholder: '0'
          })}
        </div>
      )
    }

    if (state.orderType === FLASH_BRACKET_ORDER_TYPE) {
      return (
        <div className='tradeOrderFields tradeOrderFieldsTwo'>
          {renderOrderInput({
            ariaLabel: 'Take-profit price',
            field: 'takeProfitNotionalPrice',
            label: 'Take profit',
            placeholder: '0'
          })}
          {renderOrderInput({
            ariaLabel: 'Stop-loss price',
            field: 'stopLossNotionalPrice',
            label: 'Stop loss',
            placeholder: '0'
          })}
        </div>
      )
    }

    if (state.orderType === FLASH_TWAP_ORDER_TYPE) {
      return (
        <div className='tradeOrderFields tradeOrderFieldsTwo'>
          {renderOrderInput({
            ariaLabel: 'TWAP duration seconds',
            field: 'durationSeconds',
            inputMode: 'numeric',
            label: 'Duration',
            placeholder: '3600'
          })}
          {renderOrderInput({
            ariaLabel: 'TWAP buckets',
            field: 'twapBucketCount',
            inputMode: 'numeric',
            label: 'Buckets',
            placeholder: '6'
          })}
        </div>
      )
    }

    return null
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

  const renderTradeBalanceControls = (asset: FlashAsset) => {
    return (
      <div className='tradeBalanceControls'>
        <div className='tradeBalanceText'>
          Balance {getTradeDisplayBalance(asset)} {asset.symbol}
        </div>
        <div className='tradeBalanceButtons'>
          <button onClick={() => handleSetTradeBalanceAmount(asset, 'half')} type='button'>
            HALF
          </button>
          <button onClick={() => handleSetTradeBalanceAmount(asset, 'max')} type='button'>
            MAX
          </button>
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

    return (
      <div className={editable ? 'tradeAssetCard tradeAssetCardEditable' : 'tradeAssetCard'}>
        <div className='tradeAssetCardHeader'>
          <div className={intentClass}>
            <span>{intent}</span>
            {isTarget ? renderTradeDirectionSwitch() : null}
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
        {editable ? renderTradeBalanceControls(asset) : <div className='tradeOutputNote'>Est. received</div>}
      </div>
    )
  }

  const renderTradeQuoteMeta = () => {
    const quote = state.quote
    if (!quote) return null

    const fee = quote.fees?.[0]

    return (
      <div className='tradeQuoteMeta'>
        <span>{quote.rate}</span>
        {fee ? (
          <span>
            {fee.label} {fee.amount} {fee.asset?.symbol}
          </span>
        ) : null}
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
    const isMarket = state.orderType === FLASH_MARKET_ORDER_TYPE

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
        {state.advancedOpen ? (
          <div className='tradeAdvancedPanel'>
            <label className='tradeSettingRow'>
              <span>Slippage</span>
              <div className='tradeSlippageInput'>
                <input
                  aria-label='Slippage'
                  inputMode='decimal'
                  onChange={(e) => dispatch({ type: 'settingsChanged', slippage: e.target.value })}
                  value={state.slippage}
                />
                <span>%</span>
              </div>
            </label>
            {isMarket ? (
              <label className='tradeSettingRow tradeCheckRow'>
                <span>quickTrade</span>
                <input
                  checked={state.quickTrade}
                  onChange={(e) => dispatch({ type: 'settingsChanged', quickTrade: e.target.checked })}
                  type='checkbox'
                />
              </label>
            ) : null}
          </div>
        ) : null}
      </div>
    )
  }

  const renderTradeFooter = () => {
    const enabled = canReviewTrade({
      orderType: state.orderType,
      pendingAction: state.pendingAction,
      quote: state.quote,
      quoteLoading: state.quoteLoading,
      submitting: state.submitting
    })

    return (
      <div className='tradeFooter'>
        <button
          className={enabled ? 'tradePrimaryButton' : 'tradePrimaryButton tradePrimaryButtonDisabled'}
          disabled={!enabled}
          onClick={reviewTrade}
          type='button'
        >
          {getTradePrimaryLabel({
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
          {renderTradeOrderFields()}
          {renderTradeAssetCard('target')}
          {renderTradeAssetCard('contra')}
        </div>
        {renderTradeQuoteMeta()}
        {renderTradeAdvanced()}
        {state.error ? <div className='sendMessage sendMessageError'>{state.error}</div> : null}
        {state.status ? <div className='sendMessage'>{state.status}</div> : null}
        {renderTradeSteps()}
      </div>
      {renderTradeFooter()}
    </div>
  )
}
