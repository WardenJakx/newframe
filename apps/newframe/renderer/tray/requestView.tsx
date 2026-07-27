import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

export type RequestViewStep =
  | 'confirm'
  | 'adjustFee'
  | 'adjustApproval'
  | 'adjustPermit'
  | 'viewData'
  | 'viewRaw'

export type RequestViewState = {
  step: RequestViewStep
  actionId?: string
}

type RequestViewContextValue = RequestViewState & {
  back(): boolean
  open(next: RequestViewState): void
}

const RequestViewContext = createContext<RequestViewContextValue | undefined>(undefined)
const initialView: RequestViewState = { step: 'confirm' }

export function RequestViewProvider({ children }: { children: ReactNode }) {
  const [history, setHistory] = useState<RequestViewState[]>([initialView])
  const current = history.at(-1) || initialView
  const value = useMemo<RequestViewContextValue>(
    () => ({
      ...current,
      back() {
        if (history.length === 1) return false
        setHistory((views) => views.slice(0, -1))
        return true
      },
      open(next) {
        setHistory((views) => [...views, next])
      }
    }),
    [current, history.length]
  )

  return <RequestViewContext.Provider value={value}>{children}</RequestViewContext.Provider>
}

export function useRequestView() {
  const context = useContext(RequestViewContext)
  if (!context) throw new Error('useRequestView must be used inside RequestViewProvider')
  return context
}
