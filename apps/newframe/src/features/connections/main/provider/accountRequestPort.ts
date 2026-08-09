import type { Accounts } from '../../../accounts/main/index.js'

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
