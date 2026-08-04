import React from 'react'

import { flashQuote } from './tradeService'
import { buildTradeQuoteRequest, marketTradeQuoteRequestKey, tradeErrorMessage } from './tradeTransaction'
import type { TradeWorkflowAction } from './tradeReducer'

const MARKET_QUOTE_DEBOUNCE_MS = 250
const MARKET_QUOTE_REFRESH_MS = 15_000

export interface TradeQuoteEffectRequest {
  error: string
  request: ReturnType<typeof buildTradeQuoteRequest>
  requestKey: string
}

export function useTradeQuoteRequest({
  accountAddress,
  contraAsset,
  durationDays,
  durationHours,
  durationMinutes,
  expireTime,
  inputAmount,
  limitNotionalPrice,
  maxPriceImpact,
  orderType,
  quickTrade,
  side,
  slippage,
  startTime,
  targetAsset,
  timeInForce,
  triggerNotionalPrice,
  twapBucketCount
}: Parameters<typeof buildTradeQuoteRequest>[0]) {
  return React.useMemo<TradeQuoteEffectRequest>(() => {
    try {
      const request = buildTradeQuoteRequest({
        accountAddress,
        contraAsset,
        durationDays,
        durationHours,
        durationMinutes,
        expireTime,
        inputAmount,
        limitNotionalPrice,
        maxPriceImpact,
        orderType,
        quickTrade,
        side,
        slippage,
        startTime,
        targetAsset,
        timeInForce,
        triggerNotionalPrice,
        twapBucketCount
      })

      return {
        error: '',
        request,
        requestKey: request ? marketTradeQuoteRequestKey(request) : ''
      }
    } catch (error) {
      return {
        error: tradeErrorMessage(error, 'Could not build Flash quote.'),
        request: null,
        requestKey: ''
      }
    }
  }, [
    accountAddress,
    contraAsset,
    durationDays,
    durationHours,
    durationMinutes,
    expireTime,
    inputAmount,
    limitNotionalPrice,
    maxPriceImpact,
    orderType,
    quickTrade,
    side,
    slippage,
    startTime,
    targetAsset,
    timeInForce,
    triggerNotionalPrice,
    twapBucketCount
  ])
}

export function useTradeQuote({
  dispatch,
  paused,
  quoteRequest
}: {
  dispatch: React.Dispatch<TradeWorkflowAction>
  paused: boolean
  quoteRequest: TradeQuoteEffectRequest
}) {
  React.useEffect(() => {
    if (paused) return

    if (quoteRequest.error) {
      dispatch({ type: 'quoteBuildFailed', error: quoteRequest.error })
      return
    }

    const request = quoteRequest.request
    const requestKey = quoteRequest.requestKey
    if (!request || !requestKey) {
      dispatch({ type: 'quoteCleared' })
      return
    }

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const requestQuote = () => {
      if (cancelled) return
      dispatch({ type: 'quoteRequested', requestKey })

      void flashQuote(request)
        .then((result) => {
          if (cancelled) return
          const quote = result?.quote || null

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
            quoteId: result.quoteId,
            quote,
            requestKey
          })
        })
        .catch((error) => {
          if (cancelled) return
          dispatch({
            type: 'quoteFailed',
            error: tradeErrorMessage(error, 'Flash quote failed.'),
            requestKey
          })
        })
        .finally(() => {
          if (!cancelled) timer = setTimeout(requestQuote, MARKET_QUOTE_REFRESH_MS)
        })
    }

    timer = setTimeout(requestQuote, MARKET_QUOTE_DEBOUNCE_MS)

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [dispatch, paused, quoteRequest.error, quoteRequest.request, quoteRequest.requestKey])
}
