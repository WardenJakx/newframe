import React from 'react'

import TokenSelector from '../../../resources/Components/TokenSelector'
import {
  createDisplayBalance,
  formatBalanceNotionalValue,
  formatUsdRate
} from '../../../resources/domain/balance'
import { resolveSendAssetFromRouteAssetId, toCanonicalAssetId } from '../../../resources/domain/dappLauncher'
import svg from '../../../resources/svg'
import { formatUnits, toBigInt } from '../../../resources/utils/numbers'
import { createDappWalletSelector, type DappWalletAccount } from '../../state/selectors/dappWallet'
import { useAppSelector } from '../../state/useAppSelector'
import AccountIcon from './AccountIcon'
import { createInitialSendState, sendReducer, SEND_TOKEN_ROWS_INCREMENT } from './sendReducer'
import { buildProviderSendPayload, buildSendTransaction, cleanAddress, shouldResolveName } from './sendTransaction'
import { closeSend, initSendOrigin, providerSend, resolveName } from './sendService'
import { canProceed, getAmountBaseUnits, getRecipientAddress, validateSendRequest } from './sendValidation'

interface SendProps {
  assetId?: string | null
}

function recipientName(account: DappWalletAccount) {
  return account.ensName || account.name
}

export default function Send({ assetId }: SendProps) {
  const selectSendView = React.useMemo(() => createDappWalletSelector(), [])
  const { accounts, balanceSummaries, currentAccount, networks, networksMeta } =
    useAppSelector(selectSendView)
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

  const handleSelectRecipient = React.useCallback((recipient: DappWalletAccount) => {
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
      account: { address: currentAccount.address || '' },
      amount,
      asset,
      recipientAddress
    })
    const payload = buildProviderSendPayload({
      chainId: asset.chainId,
      transaction
    })

    initSendOrigin(asset.chainId)
    dispatch({ type: 'submitStarted' })

    const response = await providerSend(payload)

    if (response?.error) {
      dispatch({
        type: 'submitFailed',
        error: response.error.message || 'Transaction failed.'
      })
    } else {
      dispatch({ type: 'submitSucceeded' })
    }
  }, [asset, currentAccount, resolveRecipientAddress, state.amount])

  const selectedKey = toCanonicalAssetId(asset)
  const visibleBalances = balanceSummaries.slice(0, state.tokenRowsVisible)
  const selectedBalance = balanceSummaries.find((balance) => toCanonicalAssetId(balance) === selectedKey)
  const menuBalances =
    selectedBalance && !visibleBalances.some((balance) => toCanonicalAssetId(balance) === selectedKey)
      ? [selectedBalance, ...visibleBalances]
      : visibleBalances
  const selectorBalances = state.tokenOpen ? menuBalances : selectedBalance ? [selectedBalance] : []
  const tokenItems = selectorBalances.map((balance) => {
    const displayBalance = createDisplayBalance(balance)

    return {
      id: toCanonicalAssetId(balance),
      symbol: displayBalance.symbol,
      amountLabel: displayBalance.displayBalance,
      notionalLabel: formatBalanceNotionalValue(displayBalance),
      chainId: displayBalance.chainId,
      logoURI: balance.logoURI
    }
  })
  const rowsHidden = Math.max(balanceSummaries.length - state.tokenRowsVisible, 0)
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
    <div className='sendApp'>
      <div className='sendHeader'>
        <button aria-label='Close Send' className='sendBackButton' onClick={handleClose}>
          {svg.chevronLeft(18)}
        </button>
        <div className='sendTitle'>Send</div>
        <div className='sendHeaderSpacer' />
      </div>
      {asset ? (
        <div className='sendBody'>
          {state.recipient ? (
            <div className='sendCard sendRecipientCard sendRecipientCardSelected'>
              <div className='sendSectionTitle'>Add recipient</div>
              <div className='sendRecipientPill'>
                <AccountIcon account={state.recipient} />
                <div className='sendRecipientText'>
                  <div className='sendRecipientName'>{recipientName(state.recipient)}</div>
                  <div className='sendRecipientAddress'>{state.recipient.address}</div>
                </div>
                <div className='sendRecipientCopy'>{svg.copy(14)}</div>
                <button
                  aria-label='Clear recipient'
                  className='sendRecipientClear'
                  onClick={handleClearRecipient}
                >
                  {svg.x(14)}
                </button>
              </div>
              <div className='sendRecipientNotice'>First time sending to this address.</div>
            </div>
          ) : (
            <div className='sendCard sendRecipientCard'>
              <div className='sendSectionTitle'>Add recipient</div>
              <div className='sendInputRow'>
                <input
                  aria-label='Recipient'
                  placeholder='Address / gns/ens name / Namoshi'
                  spellCheck={false}
                  value={state.recipientInput}
                  onChange={handleRecipientInputChange}
                />
                <button
                  aria-label='Toggle recipients'
                  className='sendInputToggle'
                  onClick={handleToggleRecipients}
                >
                  {svg.chevron(14)}
                </button>
              </div>
              {state.recipientOpen ? (
                <div className='sendRecipientMenu'>
                  <div className='sendRecipientMenuTitle'>{svg.wallet(14)} My wallets</div>
                  {recipientAccounts.map((account) => (
                    <button
                      className='sendWalletRow'
                      key={account.id}
                      onClick={() => handleSelectRecipient(account)}
                      type='button'
                    >
                      <AccountIcon account={account} />
                      <div className='sendWalletInfo'>
                        <div className='sendWalletName'>{recipientName(account)}</div>
                        <div className='sendWalletAddress'>{account.address}</div>
                      </div>
                      <div className='sendWalletCopy'>{svg.copy(14)}</div>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          )}
          <div className='sendCard sendTokenCard'>
            <div className='sendSectionTitle'>Send token</div>
            <div className='sendTokenMain'>
              <TokenSelector
                ariaLabel='Select send token'
                footer={
                  rowsHidden > 0 ? (
                    <button className='sendTokenMore' onClick={handleShowMoreTokens} type='button'>
                      {`Show ${Math.min(SEND_TOKEN_ROWS_INCREMENT, rowsHidden)} more assets`}
                    </button>
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
              <input
                aria-label='Amount'
                className='sendAmountInput'
                inputMode='decimal'
                spellCheck={false}
                value={state.amount}
                onChange={handleAmountChange}
              />
            </div>
            <div className='sendTokenMeta'>
              <div className='sendBalance'>
                {svg.wallet(13)}
                <span>
                  {asset.displayBalance || '0'} {asset.symbol || ''}
                </span>
                <button onClick={handleSetMax}>Max</button>
              </div>
              <div className='sendFiatValue'>{fiatValue}</div>
            </div>
          </div>
          {state.error ? <div className='sendMessage sendMessageError'>{state.error}</div> : null}
          {state.status ? <div className='sendMessage'>{state.status}</div> : null}
        </div>
      ) : (
        <div className='sendEmpty'>No assets available to send.</div>
      )}
      {asset ? (
        <div className='sendFooter'>
          <button
            className={proceedEnabled ? 'sendProceedButton' : 'sendProceedButton sendProceedButtonDisabled'}
            disabled={!proceedEnabled}
            onClick={handleSubmit}
          >
            Proceed
          </button>
        </div>
      ) : null}
    </div>
  )
}
