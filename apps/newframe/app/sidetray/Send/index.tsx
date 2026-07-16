import React from 'react'
import { Icon } from '@newframe/ui/icon'
import { Panel, PanelButton, PanelInput, PanelText } from '@newframe/ui/side-panel'

import TokenSelector from '../../../resources/Components/TokenSelector'
import { getTokenSelectorPage } from '../../../resources/Components/tokenSelectorModel'
import {
  createBalanceTokenSelectorItem,
  createDisplayBalance,
  formatUsdRate
} from '../../../resources/domain/balance'
import { resolveSendAssetFromRouteAssetId, toCanonicalAssetId } from '../../../resources/domain/sideTray'
import { formatUnits, toBigInt } from '../../../resources/utils/numbers'
import {
  createSideTrayWalletSelector,
  type SideTrayWalletAccount
} from '../../state/selectors/sideTrayWallet'
import { useSideTraySelector } from '../../state/useAppSelector'
import AccountIcon from './AccountIcon'
import { createInitialSendState, sendReducer, SEND_TOKEN_ROWS_INCREMENT } from './sendReducer'
import { buildSendTransaction, cleanAddress, shouldResolveName } from './sendTransaction'
import { closeSend, resolveName, submitTransaction } from './sendService'
import { canProceed, getAmountBaseUnits, getRecipientAddress, validateSendRequest } from './sendValidation'

interface SendProps {
  assetId?: string | null
}

function recipientName(account: SideTrayWalletAccount) {
  return account.ensName || account.name
}

export default function Send({ assetId }: SendProps) {
  const selectSendView = React.useMemo(() => createSideTrayWalletSelector(), [])
  const { accounts, balanceSummaries, currentAccount, networks, networksMeta } =
    useSideTraySelector(selectSendView)
  const [state, dispatch] = React.useReducer(sendReducer, assetId, createInitialSendState)

  const selectedAssetSummary = React.useMemo(() => {
    return resolveSendAssetFromRouteAssetId(state.selectedAssetKey, balanceSummaries)
  }, [balanceSummaries, state.selectedAssetKey])

  const asset = React.useMemo(() => {
    return selectedAssetSummary ? createDisplayBalance(selectedAssetSummary) : null
  }, [selectedAssetSummary])
  const recipientAccounts = React.useMemo(() => {
    const senderAddress = cleanAddress(currentAccount?.address)

    return accounts.filter((account) => {
      if (currentAccount?.id && account.id === currentAccount.id) return false
      if (senderAddress && cleanAddress(account.address) === senderAddress) return false

      return true
    })
  }, [accounts, currentAccount?.address, currentAccount?.id])

  const handleClose = React.useCallback(() => {
    closeSend()
  }, [])

  const handleRecipientInputChange = React.useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    dispatch({ type: 'setRecipientInput', recipientInput: event.target.value })
  }, [])

  const handleToggleRecipients = React.useCallback(() => {
    dispatch({ type: 'toggleRecipientOpen' })
  }, [])

  const handleSelectRecipient = React.useCallback((recipient: SideTrayWalletAccount) => {
    dispatch({ type: 'selectRecipient', recipient })
  }, [])

  const handleClearRecipient = React.useCallback(() => {
    dispatch({ type: 'clearRecipient' })
  }, [])

  const handleTokenPickerOpenChange = React.useCallback((tokenOpen: boolean) => {
    dispatch({ type: 'setTokenOpen', tokenOpen })
  }, [])

  const handleSelectAsset = React.useCallback((selectedAssetKey: string) => {
    dispatch({ type: 'selectAsset', selectedAssetKey })
  }, [])

  const handleShowMoreTokens = React.useCallback(() => {
    dispatch({ type: 'showMoreTokens' })
  }, [])

  const handleAmountChange = React.useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    dispatch({ type: 'setAmount', amount: event.target.value })
  }, [])

  const handleSetMax = React.useCallback(() => {
    if (!asset) return

    const rawBalance = toBigInt(asset.balance) || 0n
    dispatch({ type: 'setMaxAmount', amount: formatUnits(rawBalance, asset.decimals) })
  }, [asset])

  const resolveRecipientAddress = React.useCallback(async () => {
    const address = getRecipientAddress({
      recipient: state.recipient,
      recipientInput: state.recipientInput
    })

    if (address) return address

    const input = state.recipientInput.trim()
    if (shouldResolveName(input)) return resolveName(input)

    return ''
  }, [state.recipient, state.recipientInput])

  const handleSubmit = React.useCallback(async () => {
    const amount = getAmountBaseUnits(state.amount, asset)
    const balance = asset ? toBigInt(asset.balance) || 0n : 0n

    if (!currentAccount || !asset || !amount || amount <= 0n) {
      dispatch({ type: 'validationFailed', error: 'Enter an amount to send.' })
      return
    }

    if (amount > balance) {
      dispatch({ type: 'validationFailed', error: 'Amount exceeds available balance.' })
      return
    }

    let recipientAddress: string

    try {
      recipientAddress = await resolveRecipientAddress()
    } catch (e) {
      dispatch({ type: 'validationFailed', error: 'Could not resolve recipient.' })
      return
    }

    const validationError = validateSendRequest({
      account: currentAccount,
      amount,
      asset,
      balance,
      recipientAddress
    })

    if (validationError) {
      dispatch({ type: 'validationFailed', error: validationError })
      return
    }

    const transaction = buildSendTransaction({
      amount,
      asset,
      recipientAddress
    })
    dispatch({ type: 'submitStarted' })

    let response
    try {
      response = await submitTransaction(asset.chainId, transaction, crypto.randomUUID())
    } catch {
      dispatch({ type: 'submitFailed', error: 'Transaction failed.' })
      return
    }

    if (!response.ok) {
      dispatch({
        type: 'submitFailed',
        error: response.message || 'Transaction failed.'
      })
    } else {
      dispatch({ type: 'submitSucceeded' })
    }
  }, [asset, currentAccount, resolveRecipientAddress, state.amount])

  const selectedKey = toCanonicalAssetId(asset)
  const { items: selectorBalances, rowsHidden } = getTokenSelectorPage({
    getId: toCanonicalAssetId,
    items: balanceSummaries,
    open: state.tokenOpen,
    rowsVisible: state.tokenRowsVisible,
    selectedId: selectedKey
  })
  const tokenItems = selectorBalances.map(createBalanceTokenSelectorItem)
  const amount = Number(state.amount || 0)
  const price = Number(asset?.usdRate?.price || 0)
  const fiatValue = amount > 0 && price > 0 ? `$${formatUsdRate(amount * price, 2)}` : '$0.00'
  const proceedEnabled =
    canProceed({
      amount: state.amount,
      asset,
      recipient: state.recipient,
      recipientInput: state.recipientInput
    }) && !state.submitting

  return (
    <Panel variants='sendApp'>
      <Panel variants='sendHeader'>
        <PanelButton aria-label='Close Send' variants='sendBackButton' onClick={handleClose}>
          <Icon name='chevronLeft' size='large' />
        </PanelButton>
        <Panel variants='sendTitle'>Send</Panel>
        <Panel variants='sendHeaderSpacer' />
      </Panel>
      {asset ? (
        <Panel variants='sendBody'>
          {state.recipient ? (
            <Panel variants={['sendCard', 'sendRecipientCard', 'sendRecipientCardSelected']}>
              <Panel variants='sendSectionTitle'>Add recipient</Panel>
              <Panel variants='sendRecipientPill'>
                <AccountIcon account={state.recipient} />
                <Panel variants='sendRecipientText'>
                  <Panel variants='sendRecipientName'>{recipientName(state.recipient)}</Panel>
                  <Panel variants='sendRecipientAddress'>{state.recipient.address}</Panel>
                </Panel>
                <Panel variants='sendRecipientCopy'>
                  <Icon name='copy' size='small' />
                </Panel>
                <PanelButton
                  aria-label='Clear recipient'
                  variants='sendRecipientClear'
                  onClick={handleClearRecipient}
                >
                  <Icon name='close' size='small' />
                </PanelButton>
              </Panel>
              <Panel variants='sendRecipientNotice'>First time sending to this address.</Panel>
            </Panel>
          ) : (
            <Panel variants={['sendCard', 'sendRecipientCard']}>
              <Panel variants='sendSectionTitle'>Add recipient</Panel>
              <Panel variants='sendInputRow'>
                <PanelInput
                  aria-label='Recipient'
                  placeholder='Address / gns/ens name / Namoshi'
                  spellCheck={false}
                  value={state.recipientInput}
                  onChange={handleRecipientInputChange}
                />
                <PanelButton
                  aria-label='Toggle recipients'
                  variants='sendInputToggle'
                  onClick={handleToggleRecipients}
                >
                  <Icon name='chevronUp' size='small' />
                </PanelButton>
              </Panel>
              {state.recipientOpen ? (
                <Panel variants='sendRecipientMenu'>
                  <Panel variants='sendRecipientMenuTitle'>
                    <Icon name='wallet' size='small' /> My wallets
                  </Panel>
                  {recipientAccounts.map((account) => (
                    <PanelButton
                      variants='sendWalletRow'
                      key={account.id}
                      onClick={() => handleSelectRecipient(account)}
                    >
                      <AccountIcon account={account} />
                      <Panel variants='sendWalletInfo'>
                        <Panel variants='sendWalletName'>{recipientName(account)}</Panel>
                        <Panel variants='sendWalletAddress'>{account.address}</Panel>
                      </Panel>
                      <Panel variants='sendWalletCopy'>
                        <Icon name='copy' size='small' />
                      </Panel>
                    </PanelButton>
                  ))}
                </Panel>
              ) : null}
            </Panel>
          )}
          <Panel variants={['sendCard', 'sendTokenCard']}>
            <Panel variants='sendSectionTitle'>Send token</Panel>
            <Panel variants='sendTokenMain'>
              <TokenSelector
                ariaLabel='Select send token'
                footer={
                  rowsHidden > 0 ? (
                    <PanelButton variants='tokenSelectorMore' onClick={handleShowMoreTokens}>
                      {`Show ${Math.min(SEND_TOKEN_ROWS_INCREMENT, rowsHidden)} more assets`}
                    </PanelButton>
                  ) : null
                }
                items={tokenItems}
                networks={networks}
                networksMeta={networksMeta}
                onOpenChange={handleTokenPickerOpenChange}
                onSelect={handleSelectAsset}
                open={state.tokenOpen}
                selectedId={selectedKey}
              />
              <PanelInput
                aria-label='Amount'
                variants='sendAmountInput'
                inputMode='decimal'
                spellCheck={false}
                value={state.amount}
                onChange={handleAmountChange}
              />
            </Panel>
            <Panel variants='sendTokenMeta'>
              <Panel variants='sendBalance'>
                <Icon name='wallet' size='small' />
                <PanelText>
                  {asset.displayBalance || '0'} {asset.symbol || ''}
                </PanelText>
                <PanelButton onClick={handleSetMax}>Max</PanelButton>
              </Panel>
              <Panel variants='sendFiatValue'>{fiatValue}</Panel>
            </Panel>
          </Panel>
          {state.error ? <Panel variants={['sendMessage', 'sendMessageError']}>{state.error}</Panel> : null}
          {state.status ? <Panel variants='sendMessage'>{state.status}</Panel> : null}
        </Panel>
      ) : (
        <Panel variants='sendEmpty'>No assets available to send.</Panel>
      )}
      {asset ? (
        <Panel variants='sendFooter'>
          <PanelButton
            variants={
              proceedEnabled ? 'sendProceedButton' : ['sendProceedButton', 'sendProceedButtonDisabled']
            }
            disabled={!proceedEnabled}
            onClick={handleSubmit}
          >
            Proceed
          </PanelButton>
        </Panel>
      ) : null}
    </Panel>
  )
}
