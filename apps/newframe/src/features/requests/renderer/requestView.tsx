import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from 'react'

import { typeSupportsBaseFee } from '../../transactions/domain'
import type { TransactionApprovalAdjustments } from '../../transactions/domain/approval'
import {
  limitTransactionFee,
  transactionFeePreset,
  type TransactionFeeField,
  type TransactionFeeLevel,
  type TransactionFeeValues
} from '../../transactions/domain/fees'
import type { TransactionRequestView } from './Account/Requests/requestViewTypes'

type FeeRequest = Pick<TransactionRequestView, 'data' | 'status' | 'mode' | 'locked'>
type FeeData = Pick<
  FeeRequest['data'],
  'type' | 'chainId' | 'gasLimit' | 'gasPrice' | 'maxFeePerGas' | 'maxPriorityFeePerGas'
>
const editable = (request: FeeRequest) => !request.status && !request.locked && request.mode !== 'monitor'
const fees = (data: FeeData): TransactionFeeValues => {
  const priorityFee = BigInt(data.maxPriorityFeePerGas ?? '0x0')
  return {
    gasLimit: BigInt(data.gasLimit ?? '0x0'),
    ...(typeSupportsBaseFee(data.type)
      ? { baseFee: BigInt(data.maxFeePerGas ?? '0x0') - priorityFee, priorityFee }
      : { gasPrice: BigInt(data.gasPrice ?? '0x0') })
  }
}

export function updateTransactionFee(
  data: FeeData,
  adjustments: TransactionApprovalAdjustments | undefined,
  field: TransactionFeeField,
  value: bigint
): TransactionApprovalAdjustments {
  const current = fees({ ...data, ...adjustments })
  return adjustmentsFor({
    ...current,
    [field]: limitTransactionFee(field, value, current, data.chainId)
  })
}
const adjustmentsFor = (values: TransactionFeeValues): TransactionApprovalAdjustments => {
  const hex = (value: bigint) => `0x${value.toString(16)}`
  return {
    gasLimit: hex(values.gasLimit),
    ...(values.gasPrice !== undefined
      ? { gasPrice: hex(values.gasPrice) }
      : {
          maxFeePerGas: hex((values.baseFee ?? 0n) + (values.priorityFee ?? 0n)),
          maxPriorityFeePerGas: hex(values.priorityFee ?? 0n)
        })
  }
}

export type RequestViewStep = 'confirm' | 'adjustFee' | 'adjustApproval' | 'adjustPermit' | 'viewRaw'

export type RequestViewState = {
  step: RequestViewStep
  actionId?: string
}

type RequestViewContextValue = RequestViewState & {
  adjustments?: TransactionApprovalAdjustments
  feeLevel?: TransactionFeeLevel | 'custom'
  feeNoticeDismissed: boolean
  dismissFeeNotice: () => void
  displayRequest: <T extends FeeRequest>(request: T) => T
  updateFee: (request: FeeRequest, field: TransactionFeeField, value: bigint) => void
  selectFeeLevel: (
    request: FeeRequest,
    level: TransactionFeeLevel,
    recommendation: Parameters<typeof transactionFeePreset>[1]
  ) => void
  back: () => boolean
  open: (next: RequestViewState) => void
}

const RequestViewContext = createContext<RequestViewContextValue | undefined>(undefined)
const initialView: RequestViewState = { step: 'confirm' }

export function RequestViewProvider({ children }: { children: ReactNode }) {
  const [history, setHistory] = useState<RequestViewState[]>([initialView])
  const [draft, setDraft] = useState<{
    adjustments?: TransactionApprovalAdjustments
    feeLevel?: TransactionFeeLevel | 'custom'
  }>({})
  const draftRef = useRef(draft)
  const [feeNoticeDismissed, setFeeNoticeDismissed] = useState(false)
  const saveFees = (
    adjustments: TransactionApprovalAdjustments,
    feeLevel: TransactionFeeLevel | 'custom'
  ) => {
    draftRef.current = { adjustments, feeLevel }
    setDraft(draftRef.current)
  }
  const current = history.at(-1) ?? initialView
  const value = useMemo<RequestViewContextValue>(
    () => ({
      ...current,
      ...draft,
      feeNoticeDismissed,
      dismissFeeNotice: () => setFeeNoticeDismissed(true),
      displayRequest(request) {
        return editable(request) && draft.adjustments
          ? { ...request, data: { ...request.data, ...draft.adjustments } }
          : request
      },
      updateFee(request, field, value) {
        if (!editable(request)) {
          return
        }
        saveFees(updateTransactionFee(request.data, draftRef.current.adjustments, field, value), 'custom')
      },
      selectFeeLevel(request, level, recommendation) {
        if (!editable(request)) {
          return
        }
        saveFees(
          adjustmentsFor(
            transactionFeePreset(
              fees({ ...request.data, ...draftRef.current.adjustments }),
              recommendation,
              level,
              request.data.chainId
            )
          ),
          level
        )
      },
      back() {
        if (history.length === 1) {
          return false
        }
        setHistory((views) => views.slice(0, -1))
        return true
      },
      open(next) {
        setHistory((views) => [...views, next])
      }
    }),
    [current, history.length, draft, feeNoticeDismissed]
  )

  return <RequestViewContext.Provider value={value}>{children}</RequestViewContext.Provider>
}

export function useRequestView() {
  const context = useContext(RequestViewContext)
  if (!context) {
    throw new Error('useRequestView must be used inside RequestViewProvider')
  }
  return context
}
