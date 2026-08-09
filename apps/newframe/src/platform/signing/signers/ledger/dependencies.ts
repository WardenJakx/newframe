import { createRequire } from 'node:module'

const loadCommonJs = createRequire(import.meta.url)

export const getLedgerDevices = (
  loadCommonJs(
    '@ledgerhq/hw-transport-node-hid-noevents'
  ) as typeof import('@ledgerhq/hw-transport-node-hid-noevents')
).getDevices

export const TransportNodeHidNoEvents = (
  loadCommonJs(
    '@ledgerhq/hw-transport-node-hid-noevents'
  ) as typeof import('@ledgerhq/hw-transport-node-hid-noevents')
).default

export const TransportNodeHidSingleton = (
  loadCommonJs(
    '@ledgerhq/hw-transport-node-hid-singleton'
  ) as typeof import('@ledgerhq/hw-transport-node-hid-singleton')
).default

export const LedgerEthereumApp = (
  loadCommonJs('@ledgerhq/hw-app-eth') as typeof import('@ledgerhq/hw-app-eth')
).default
