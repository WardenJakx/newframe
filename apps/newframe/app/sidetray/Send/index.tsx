import React from 'react'
import { Button } from '@newframe/ui/button'
import { Icon } from '@newframe/ui/icon'
import { IconButton } from '@newframe/ui/icon-button'
import { Input } from '@newframe/ui/input'
import { ScrollArea } from '@newframe/ui/scroll-area'
import { Stack } from '@newframe/ui/stack'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'

import TokenSelector from '../../../resources/Components/TokenSelector'
import { SidePanel } from '../../../resources/Components/SidePanel/SidePanel'
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
    const explicitlySelectedAsset = balanceSummaries.find(
      (balance) => toCanonicalAssetId(balance) === state.selectedAssetKey
    )

    return (
      explicitlySelectedAsset ||
      resolveSendAssetFromRouteAssetId(state.selectedAssetKey, balanceSummaries) ||
      balanceSummaries[0] ||
      null
    )
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
  }, [accounts, currentAccount])

  const handleClose = React.useCallback(() => {
    closeSend()
  }, [])

  const handleRecipientInputChange = React.useCallback((recipientInput: string) => {
    dispatch({ type: 'setRecipientInput', recipientInput })
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

  const handleAmountChange = React.useCallback((amount: string) => {
    dispatch({ type: 'setAmount', amount })
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
  const searchableTokenItems = balanceSummaries.map(createBalanceTokenSelectorItem)
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
    <SidePanel
      closeLabel='Close Send'
      footer={
        asset ? (
          <Stack grow>
            <Button
              appearance='primary'
              disabled={!proceedEnabled}
              onPress={handleSubmit}
              shape='pill'
              size='large'
            >
              <Text align='center' variant='action' tone='inverse'>
                Proceed
              </Text>
            </Button>
          </Stack>
        ) : undefined
      }
      footerCompact
      onClose={handleClose}
      title='Send'
    >
      {asset ? (
        <Stack gap='medium'>
          <Surface padding='large' radius='control' tone='card'>
            <Stack gap='medium'>
              <Text variant='sectionTitle' tone='secondary'>
                Add recipient
              </Text>
              {state.recipient ? (
                <Stack gap='small'>
                  <Surface border='accent' padding='small' radius='control' tone='raised'>
                    <Stack align='center' direction='row' gap='medium'>
                      <AccountIcon account={state.recipient} />
                      <Stack gap='xsmall' grow>
                        <Text variant='heading' truncate>
                          {recipientName(state.recipient)}
                        </Text>
                        <Text variant='detail' tone='secondary' truncate>
                          {state.recipient.address}
                        </Text>
                      </Stack>
                      <Text display='inline' tone='secondary'>
                        <Icon name='copy' size='small' />
                      </Text>
                      <IconButton
                        icon='close'
                        label='Clear recipient'
                        onPress={handleClearRecipient}
                        size='small'
                      />
                    </Stack>
                  </Surface>
                  <Text variant='body' tone='warning'>
                    First time sending to this address.
                  </Text>
                </Stack>
              ) : (
                <Stack gap='medium'>
                  <Surface padding='small' radius='control' tone='raised'>
                    <Stack align='center' direction='row' gap='small'>
                      <Stack grow>
                        <Input
                          appearance='plain'
                          label='Recipient'
                          onValueChange={handleRecipientInputChange}
                          placeholder='Address / gns/ens name / Namoshi'
                          spellCheck={false}
                          value={state.recipientInput}
                        />
                      </Stack>
                      <IconButton
                        expanded={state.recipientOpen}
                        icon='chevronUp'
                        label='Toggle recipients'
                        onPress={handleToggleRecipients}
                        size='small'
                      />
                    </Stack>
                  </Surface>
                  {state.recipientOpen ? (
                    <Surface elevation='default' padding='none' radius='control' tone='control'>
                      <ScrollArea height='menu'>
                        <Stack gap='none'>
                          <Surface padding='small' radius='none' tone='transparent'>
                            <Stack align='center' direction='row' gap='small'>
                              <Icon name='wallet' size='small' />
                              <Text variant='label' tone='secondary'>
                                My wallets
                              </Text>
                            </Stack>
                          </Surface>
                          {recipientAccounts.map((account) => (
                            <Button
                              appearance='row'
                              key={account.id}
                              onPress={() => handleSelectRecipient(account)}
                              size='large'
                            >
                              <AccountIcon account={account} />
                              <Stack gap='xsmall' grow>
                                <Text variant='heading' truncate>
                                  {recipientName(account)}
                                </Text>
                                <Text variant='detail' tone='secondary' truncate>
                                  {account.address}
                                </Text>
                              </Stack>
                              <Icon name='copy' size='small' />
                            </Button>
                          ))}
                        </Stack>
                      </ScrollArea>
                    </Surface>
                  ) : null}
                </Stack>
              )}
            </Stack>
          </Surface>
          <Surface padding='large' radius='control' tone='card'>
            <Stack gap='large'>
              <Text variant='sectionTitle' tone='secondary'>
                Send token
              </Text>
              <Stack align='center' direction='row' gap='large' justify='between'>
                <TokenSelector
                  ariaLabel='Select send token'
                  footer={
                    rowsHidden > 0 ? (
                      <Stack>
                        <Button onPress={handleShowMoreTokens}>
                          <Text
                            align='center'
                            variant='supporting'
                            tone='secondary'
                          >{`Show ${Math.min(SEND_TOKEN_ROWS_INCREMENT, rowsHidden)} more assets`}</Text>
                        </Button>
                      </Stack>
                    ) : null
                  }
                  items={tokenItems}
                  searchableItems={searchableTokenItems}
                  networks={networks}
                  networksMeta={networksMeta}
                  onOpenChange={handleTokenPickerOpenChange}
                  onSelect={handleSelectAsset}
                  open={state.tokenOpen}
                  selectedId={selectedKey}
                />
                <Stack grow>
                  <Input
                    align='end'
                    appearance='amount'
                    label='Amount'
                    inputMode='decimal'
                    onValueChange={handleAmountChange}
                    spellCheck={false}
                    value={state.amount}
                  />
                </Stack>
              </Stack>
              <Stack align='center' direction='row' gap='small' justify='between'>
                <Stack align='center' direction='row' gap='small' grow>
                  <Icon name='wallet' size='small' />
                  <Text variant='body' tone='secondary' truncate>
                    {asset.displayBalance || '0'} {asset.symbol || ''}
                  </Text>
                  <Button appearance='subtle' onPress={handleSetMax} shape='pill' size='compact'>
                    <Text display='inline' variant='caption' tone='accent'>
                      Max
                    </Text>
                  </Button>
                </Stack>
                <Text variant='numeric' tone='secondary'>
                  {fiatValue}
                </Text>
              </Stack>
            </Stack>
          </Surface>
          {state.error ? (
            <Text align='center' variant='body' tone='danger'>
              {state.error}
            </Text>
          ) : null}
          {state.status ? (
            <Text align='center' variant='body' tone='secondary'>
              {state.status}
            </Text>
          ) : null}
        </Stack>
      ) : (
        <Stack align='center' grow justify='center'>
          <Text tone='secondary'>No assets available to send.</Text>
        </Stack>
      )}
    </SidePanel>
  )
}
