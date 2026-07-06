export const LinkSendChannels = [
  '*:addFrame',
  '*:contextmenu',
  'dash:reloadSigner',
  'dash:removeSigner',
  'frame:close',
  'frame:max',
  'frame:min',
  'frame:unmax',
  'nav:back',
  'nav:forward',
  'nav:update',
  'tray:action',
  'tray:addChain',
  'tray:addToken',
  'tray:adjustNonce',
  'tray:clearOrigins',
  'tray:clearRequestsByOrigin',
  'tray:clipboardData',
  'tray:copyTxHash',
  'tray:dismissUpdate',
  'tray:giveAccess',
  'tray:installAvailableUpdate',
  'tray:mouseout',
  'tray:openExplorer',
  'tray:openExternal',
  'tray:quit',
  'tray:ready',
  'tray:rejectRequest',
  'tray:removeOrigin',
  'tray:removeToken',
  'tray:renameAccount',
  'tray:replaceTx',
  'tray:resetAllSettings',
  'tray:resetNonce',
  'tray:resolveRequest',
  'tray:switchChain',
  'tray:syncPath',
  'tray:updateRestart'
] as const

export type LinkSendChannel = (typeof LinkSendChannels)[number]

export const LinkInvokeChannels = [
  'tray:getTokenDetails',
  'tray:hydrateChainIcon',
  'tray:refreshPortfolioBalances'
] as const

export type LinkInvokeChannel = (typeof LinkInvokeChannels)[number]

export const LinkRpcMethods = [
  'addKeystore',
  'addPrivateKey',
  'approveRequest',
  'biometricsState',
  'changeVaultPassword',
  'confirmRequestApproval',
  'connectionStatus',
  'createAccount',
  'createFromAddress',
  'createFromKeystore',
  'createFromPhrase',
  'createFromPrivateKey',
  'createLattice',
  'declineRequest',
  'disableBiometrics',
  'enableBiometrics',
  'exportAccountPrivateKey',
  'generatePhrase',
  'getAccounts',
  'getCoinbase',
  'getFrameId',
  'getState',
  'latticePair',
  'launchStatus',
  'locateKeystore',
  'lockSigner',
  'lockVault',
  'openExplorer',
  'providerSend',
  'remove',
  'removeAccount',
  'removeFeeUpdateNotice',
  'removePrivateKey',
  'resolveName',
  'respondToExtensionRequest',
  'setBaseFee',
  'setGasLimit',
  'setGasPrice',
  'setPriorityFee',
  'setSigner',
  'signMessage',
  'signTransaction',
  'signerCompatibility',
  'trezorEnterPhrase',
  'trezorPhrase',
  'trezorPin',
  'unlockSigner',
  'unlockVault',
  'unlockVaultWithBiometrics',
  'unsetSigner',
  'updateRequest',
  'vaultState',
  'verifyAddress'
] as const

export type LinkRpcMethod = (typeof LinkRpcMethods)[number]

export const LinkEvents = ['action'] as const

export type LinkEvent = (typeof LinkEvents)[number]

export interface NewframeHost {
  send(channel: LinkSendChannel, args: unknown[]): void
  invoke(channel: LinkInvokeChannel, args: unknown[]): Promise<unknown>
  rpc(method: LinkRpcMethod, args: unknown[]): Promise<unknown[]>
  onAction(handler: (...args: unknown[]) => void): () => void
}
