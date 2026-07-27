import type { Accounts } from '../accounts/index.js'

export type AccountRequestPort = Pick<
  Accounts,
  | 'clearRequestsByOrigin'
  | 'current'
  | 'get'
  | 'getAccounts'
  | 'getFrameAccount'
  | 'getSelectedAddresses'
  | 'lockRequest'
  | 'routeRequest'
  | 'setSigner'
  | 'setTxSigned'
  | 'signMessage'
  | 'signTransaction'
  | 'signTypedData'
  | 'trackAutonomousTransaction'
  | 'updateNonce'
>

export function createDeferredAccountRequestPort() {
  let target: AccountRequestPort | undefined

  const getTarget = () => {
    if (!target) throw new Error('Provider account request capability is not connected')
    return target
  }

  const port = new Proxy({} as AccountRequestPort, {
    get(_object, property) {
      const value = getTarget()[property as keyof AccountRequestPort]
      return typeof value === 'function' ? value.bind(getTarget()) : value
    }
  })

  return {
    port,
    connect(next: AccountRequestPort) {
      const previous = target
      target = next
      let connected = true

      return () => {
        if (!connected) return
        connected = false
        if (target === next) target = previous
      }
    }
  }
}

const accountRequests = createDeferredAccountRequestPort()

export const accountRequestPort = accountRequests.port
export const connectAccountRequests = accountRequests.connect
