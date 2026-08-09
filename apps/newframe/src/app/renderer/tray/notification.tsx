import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

export type TrayNotificationData = Record<string, unknown>
export type TrayNotifier = (type?: string, data?: TrayNotificationData) => void

type TrayNotificationContextValue = {
  type: string
  data: TrayNotificationData
  notify: TrayNotifier
}

const TrayNotificationContext = createContext<TrayNotificationContextValue | undefined>(undefined)

export function TrayNotificationProvider({ children }: { children: ReactNode }) {
  const [notification, setNotification] = useState<Omit<TrayNotificationContextValue, 'notify'>>({
    type: '',
    data: {}
  })
  const notify = useCallback<TrayNotifier>((type = '', data = {}) => setNotification({ type, data }), [])
  const value = useMemo(() => ({ ...notification, notify }), [notification, notify])

  return <TrayNotificationContext.Provider value={value}>{children}</TrayNotificationContext.Provider>
}

export function useTrayNotification() {
  const context = useContext(TrayNotificationContext)
  if (!context) throw new Error('useTrayNotification must be used inside TrayNotificationProvider')
  return context
}
