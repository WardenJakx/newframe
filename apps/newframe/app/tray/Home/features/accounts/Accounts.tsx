import React, { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Button } from '@newframe/ui/button'
import { Heading } from '@newframe/ui/heading'
import { Icon } from '@newframe/ui/icon'
import { IconButton } from '@newframe/ui/icon-button'
import { Field } from '@newframe/ui/field'
import { Inline } from '@newframe/ui/inline'
import { Input } from '@newframe/ui/input'
import { ScrollArea } from '@newframe/ui/scroll-area'
import { SearchField } from '@newframe/ui/search-field'
import { Spinner } from '@newframe/ui/spinner'
import { Stack } from '@newframe/ui/stack'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'

import { HeaderBar } from '../../../../../resources/Components/HeaderBar'
import { SidePanelHeader } from '../../../../../resources/Components/SidePanel/SidePanelHeader'
import link from '../../../../../resources/link'
import svg from '../../../../../resources/svg'
import { createBalanceSummarySelector, formatUsdRate } from '../../../../../resources/domain/balance'
import { useWalletSelector } from '../../../../state/useAppSelector'
import type { WalletRendererState } from '../../../../../resources/state/projections'
import AccountRenameInput from '../../AccountRenameInput'
import { useHomeUiStore } from '../../state/HomeUiProvider'
import { AddAccount } from './AddAccount'
import { cva } from '../../../../../resources/styled-system/css/cva.js'

type HomeAccount = WalletRendererState['accounts'][string]
type HomeSigner = WalletRendererState['signers'][string]

interface AccountsState {
  accountCopied: string
  accountExportCopied: boolean
  accountExportError: string
  accountExportLoading: boolean
  accountExportPassword: string
  accountExportRevealed: boolean
  accountExportSecret: string
  accountExported: string
  accountExporting: string
  accountMenu: string
  accountQuery: string
  accountRemoving: string
  accountRenaming: string
  addingAccount: boolean
  draggingAccount: string
  dragOverAccount: string
}

const signerTypeLabels: Record<string, string> = {
  ring: 'Hot Signer',
  seed: 'Hot Signer',
  address: 'Watch-only',
  Address: 'Watch-only',
  ledger: 'Ledger',
  trezor: 'Trezor',
  lattice: 'Lattice'
}

const EMPTY_ARRAY: any[] = []
const EMPTY_RECORD: Record<string, any> = {}

const overlayRecipe = cva({
  base: {
    position: 'absolute',
    inset: 0,
    zIndex: 'overlay',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    background: 'bg.primary'
  }
})

const toolsRecipe = cva({
  base: { display: 'flex', flex: 'none', alignItems: 'center', gap: '4', padding: '4' }
})

const accountRowRecipe = cva({
  base: {
    position: 'relative',
    display: 'flex',
    minHeight: 'menu-row-min',
    alignItems: 'center',
    gap: '4',
    padding: '5 6',
    borderWidth: 'thin',
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: 'control',
    background: 'bg.card',
    cursor: 'pointer',
    _hover: { background: 'bg.hover' }
  },
  variants: {
    selected: { true: { borderColor: 'border.focus' }, false: {} },
    dragging: { true: { opacity: 'disabled' }, false: {} },
    dropTarget: { true: { borderColor: 'border.focus', background: 'action.primary.subtle' }, false: {} }
  },
  defaultVariants: { dragging: false, dropTarget: false, selected: false }
})

const accountIconRecipe = cva({
  base: {
    display: 'grid',
    width: 'icon-button-medium',
    height: 'icon-button-medium',
    flex: 'none',
    placeItems: 'center',
    borderRadius: 'pill',
    background: 'bg.control',
    color: 'action.primary'
  }
})

const actionsMenuRecipe = cva({
  base: {
    position: 'absolute',
    insetInlineEnd: '4',
    insetBlockStart: 'token(sizes.list-row)',
    zIndex: 'header',
    width: 'selection-trigger',
    padding: '2',
    borderRadius: 'default',
    background: 'bg.hover',
    boxShadow: 'elevation-overlay'
  }
})

const secretRecipe = cva({
  base: {
    minHeight: 'field-vertical',
    padding: '4',
    borderRadius: 'default',
    background: 'bg.raised',
    wordBreak: 'break-all',
    userSelect: 'text'
  },
  variants: { revealed: { true: {}, false: { filter: 'blur(token(spacing.2))' } } },
  defaultVariants: { revealed: false }
})

function operationError(result: any, fallback: string) {
  return result && 'message' in result && typeof result.message === 'string' ? result.message : fallback
}

export function Accounts() {
  const shared = useWalletSelector(
    useShallow((main) => ({
      accountOrder: main.accountOrder || EMPTY_ARRAY,
      accounts: main.accounts || EMPTY_RECORD,
      balances: main.balances || EMPTY_RECORD,
      currentAccount: main.currentAccount || '',
      networks: main.networks?.ethereum || EMPTY_RECORD,
      networksMeta: main.networksMeta?.ethereum || EMPTY_RECORD,
      rates: main.rates || EMPTY_RECORD,
      tokens: main.tokens,
      showLocalNameWithENS: !!main.showLocalNameWithENS,
      showTestnets: !!main.showTestnets,
      signers: main.signers || EMPTY_RECORD
    }))
  )
  const props = { shared }
  const overlay = useHomeUiStore((ui) => ui.overlay)
  const closeOverlay = useHomeUiStore((ui) => ui.closeOverlay)
  const accountFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const accountSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const accountSearchInputRef = useRef<HTMLInputElement | null>(null)
  const [selectBalanceSummaries] = useState(() => createBalanceSummarySelector())
  const [state, setHomeState] = useState<AccountsState>({
    accountQuery: '',
    accountMenu: '',
    accountRenaming: '',
    accountRemoving: '',
    accountCopied: '',
    accountExported: '',
    accountExporting: '',
    accountExportPassword: '',
    accountExportSecret: '',
    accountExportRevealed: false,
    accountExportError: '',
    accountExportLoading: false,
    accountExportCopied: false,
    draggingAccount: '',
    dragOverAccount: '',
    addingAccount: overlay.type === 'accounts' && !!overlay.showAddAccounts
  })
  const setState = (update: any, callback?: () => void) => {
    const next = typeof update === 'function' ? update(state, props) : update
    if (next.accountsOpen === false || (next.overlay === null && next.accountsOpen !== true)) {
      closeOverlay()
    }
    const local = { ...next }
    ;['accountsOpen', 'menuOpen', 'overlay', 'receiveAccount'].forEach((key) => delete local[key])
    if (Object.keys(local).length) {
      setHomeState((current) => ({ ...current, ...(local as Partial<AccountsState>) }))
    }
    callback?.()
  }

  useEffect(() => {
    return () => {
      clearTimeout(accountFeedbackTimeoutRef.current)
      clearTimeout(accountSearchTimeoutRef.current)
    }
  }, [])

  function signerIcon(type: string, size = 16) {
    if ((type || '').toLowerCase() === 'address') return svg.eye(size)
    if (type === 'ledger') return svg.ledger(size)
    if (type === 'trezor') return svg.trezor(size)
    if (type === 'lattice') return svg.lattice(size)
    return svg.flame(size + 2)
  }

  function getBalances(address: string) {
    const rawBalances = props.shared.balances[address] || []
    const { networks, networksMeta, rates, tokens } = props.shared
    const showTestnets = props.shared.showTestnets

    return selectBalanceSummaries({
      rawBalances,
      rates,
      tokens,
      networks,
      networksMeta,
      includeChain: (chain) => {
        return (!chain.isTestnet || showTestnets) && !!chain.on
      },
      cacheKey: `${address}:${showTestnets ? 'testnets' : 'mainnets'}`
    })
  }

  function accountNavValue(account: any) {
    if (!account || !account.address) return '---'
    const rawBalances = props.shared.balances[account.address]
    if (!Array.isArray(rawBalances) || rawBalances.length === 0) return '---'

    const total = getBalances(account.address).reduce(
      (sum: number, balance: any) => sum + balance.totalValue,
      0
    )
    return `$${formatUsdRate(total, 2)}`
  }

  function accountDisplayName(account: any) {
    if (!account) return ''
    const showLocal = props.shared.showLocalNameWithENS
    return account.ensName && !showLocal ? account.ensName : account.name
  }

  function shortAddress(address = '') {
    return address ? `${address.substring(0, 5)}…${address.substring(address.length - 4)}` : ''
  }

  function accountType(account: any) {
    return (account?.lastSignerType || '').toString()
  }

  function isWatchOnlyAccount(account: any) {
    return accountType(account).toLowerCase() === 'address'
  }

  function isHotAccount(account: any) {
    return ['ring', 'seed'].includes(accountType(account).toLowerCase())
  }

  function accountIcon(account: any, size = 16) {
    return isWatchOnlyAccount(account) ? svg.eye(size) : signerIcon(account.lastSignerType, size)
  }

  function accountTypeLabel(account: any) {
    const type = accountType(account)
    return signerTypeLabels[type] || signerTypeLabels[type.toLowerCase()] || type || 'Account'
  }

  function orderedAccountIds(accounts: Record<string, any>) {
    const createdOrder = Object.keys(accounts).sort((a, b) => {
      if (accounts[a].created > accounts[b].created) return 1
      if (accounts[a].created < accounts[b].created) return -1
      return 0
    })
    const accountOrder = props.shared.accountOrder
    const ordered = accountOrder.filter((id) => accounts[id])

    createdOrder.forEach((id) => {
      if (!ordered.includes(id)) ordered.push(id)
    })

    return ordered
  }

  function updateAccountSearch(value: string) {
    clearTimeout(accountSearchTimeoutRef.current)
    accountSearchTimeoutRef.current = setTimeout(() => setState({ accountQuery: value }), 80)
  }

  function clearAccountSearch() {
    clearTimeout(accountSearchTimeoutRef.current)
    if (accountSearchInputRef.current) accountSearchInputRef.current.value = ''
    setState({ accountQuery: '' })
  }

  function accountMatchesQuery(account: any, query: string) {
    if (!query) return true
    const normalizedQuery = query.toLowerCase()
    const searchText = [
      accountDisplayName(account),
      account.address,
      shortAddress(account.address),
      accountTypeLabel(account)
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return normalizedQuery.split(/\s+/).every((part) => searchText.includes(part))
  }

  function reorderAccount(fromId: string, toId: string) {
    if (!fromId || !toId || fromId === toId) return
    void link.executeCommand({
      type: 'account.reorder',
      fromAccountId: fromId,
      toAccountId: toId
    })
  }

  function startAccountDrag(e: React.DragEvent, accountId: string) {
    e.stopPropagation()
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', accountId)
    setState({ draggingAccount: accountId, dragOverAccount: '' })
  }

  function dragAccountOver(e: React.DragEvent, accountId: string) {
    if (!state.draggingAccount || state.draggingAccount === accountId) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    if (state.dragOverAccount !== accountId) setState({ dragOverAccount: accountId })
  }

  function dropAccount(e: React.DragEvent, accountId: string) {
    e.preventDefault()
    e.stopPropagation()

    const dragged = e.dataTransfer.getData('text/plain') || state.draggingAccount
    reorderAccount(dragged, accountId)
    setState({ draggingAccount: '', dragOverAccount: '' })
  }

  function endAccountDrag() {
    setState({ draggingAccount: '', dragOverAccount: '' })
  }

  function flashAccountFeedback(key: 'accountCopied' | 'accountExported', value: string) {
    clearTimeout(accountFeedbackTimeoutRef.current)
    setState({ [key]: value })
    accountFeedbackTimeoutRef.current = setTimeout(() => setState({ [key]: '' }), 1800)
  }

  function copyAccountAddress(account: any) {
    if (!account?.address) return
    void link.executeCommand({ type: 'clipboard.write', text: account.address })
    flashAccountFeedback('accountCopied', account.id)
  }

  function startRenameAccount(account: any) {
    setState({
      accountRenaming: account.id,
      accountMenu: '',
      accountRemoving: ''
    })
  }

  function saveRenameAccount(accountId: string, nextName: string) {
    const name = (nextName || '').trim()
    if (name) void link.executeCommand({ type: 'account.rename', accountId, name })
    setState({ accountRenaming: '' })
  }

  function seedSignerForAccount(account?: HomeAccount | null): HomeSigner | null {
    if (accountType(account).toLowerCase() !== 'seed' || !account?.signer) return null

    const signer = props.shared.signers[account.signer]
    return signer?.type === 'seed' ? signer : null
  }

  function isLastAccountForSeedPhrase(account: HomeAccount, accounts: Record<string, HomeAccount>) {
    const signer = seedSignerForAccount(account)
    if (!signer) return false

    return !Object.values(accounts).some((otherAccount) => {
      return otherAccount.id !== account.id && otherAccount.signer === signer.id
    })
  }

  function removeAccount(accountId: string, options: { removeSeedPhrase?: boolean } = {}) {
    void link.executeCommand({
      type: 'account.remove',
      address: accountId,
      removeSeedSigner: !!options.removeSeedPhrase
    })
    setState({ accountRemoving: '', accountMenu: '' })
  }

  function openPrivateKeyExport(account: any) {
    if (!isHotAccount(account)) return

    setState({
      accountMenu: '',
      accountRemoving: '',
      accountExporting: account.id,
      accountExportPassword: '',
      accountExportSecret: '',
      accountExportRevealed: false,
      accountExportError: '',
      accountExportLoading: false,
      accountExportCopied: false
    })
  }

  function closePrivateKeyExport() {
    setState({
      accountExporting: '',
      accountExportPassword: '',
      accountExportSecret: '',
      accountExportRevealed: false,
      accountExportError: '',
      accountExportLoading: false,
      accountExportCopied: false
    })
  }

  function closeAccountsPanel() {
    setState({
      accountsOpen: false,
      accountMenu: '',
      accountRenaming: '',
      accountRemoving: '',
      accountExporting: '',
      accountExportPassword: '',
      accountExportSecret: '',
      accountExportRevealed: false,
      accountExportError: '',
      accountExportLoading: false,
      accountExportCopied: false,
      addingAccount: false
    })
  }

  async function unlockPrivateKeyExport(account: any) {
    const password = state.accountExportPassword
    if (!account?.address || state.accountExportLoading) return
    if (!password) return setState({ accountExportError: 'Password required' })

    setState({ accountExportLoading: true, accountExportError: '', accountExportCopied: false })

    const result = await link.executeQuery({
      type: 'account.private-key-export',
      accountId: account.address,
      password
    })
    if (result.ok) {
      setState({
        accountExportLoading: false,
        accountExportPassword: '',
        accountExportSecret: result.privateKey,
        accountExportRevealed: false,
        accountExportError: ''
      })
    } else {
      setState({
        accountExportLoading: false,
        accountExportError: operationError(result, 'Could not export the private key.'),
        accountExportSecret: '',
        accountExportRevealed: false
      })
    }
  }

  function copyExportedPrivateKey() {
    if (!state.accountExportSecret) return
    void link.executeCommand({ type: 'clipboard.write', text: state.accountExportSecret })
    setState({ accountExportCopied: true })
  }

  function renderPrivateKeyExport(accounts: Record<string, any>) {
    const account = accounts[state.accountExporting]
    if (!account) return null

    const hasSecret = !!state.accountExportSecret
    const keyText = hasSecret
      ? state.accountExportSecret
      : '0x0000000000000000000000000000000000000000000000000000000000000000'

    return (
      <Stack grow gap='none'>
        <SidePanelHeader
          closeLabel='Back to accounts'
          onClose={closePrivateKeyExport}
          title='Private key export'
        />
        <Surface padding='medium' radius='none' tone='transparent'>
          <Stack gap='medium'>
            {!hasSecret ? (
              <Field label='Newframe password' vertical>
                <Input
                  label='Private key export password'
                  autoFocus
                  placeholder='Enter password'
                  type='password'
                  value={state.accountExportPassword}
                  onValueChange={(value) => setState({ accountExportPassword: value })}
                  onSubmit={() => void unlockPrivateKeyExport(account)}
                />
              </Field>
            ) : null}
            <div className={secretRecipe({ revealed: hasSecret && state.accountExportRevealed })}>
              <Text variant='code'>{keyText}</Text>
            </div>
            {state.accountExportError ? <Text tone='danger'>{state.accountExportError}</Text> : null}
            <Inline align='center' gap='small'>
              {hasSecret ? (
                <Button appearance='primary' onPress={copyExportedPrivateKey} size='medium'>
                  <Icon name={state.accountExportCopied ? 'check' : 'copy'} size='small' />
                  <Text variant='compactAction'>{state.accountExportCopied ? 'Copied' : 'Copy key'}</Text>
                </Button>
              ) : (
                <Button
                  appearance='primary'
                  disabled={state.accountExportLoading}
                  onPress={() => void unlockPrivateKeyExport(account)}
                  size='medium'
                >
                  {state.accountExportLoading ? <Spinner label='Unlocking' size='small' /> : null}
                  <Text variant='compactAction'>
                    {state.accountExportLoading ? 'Unlocking' : 'Unlock export'}
                  </Text>
                </Button>
              )}
              {hasSecret ? (
                <Button
                  appearance='control'
                  onPress={() => setState({ accountExportRevealed: !state.accountExportRevealed })}
                  size='medium'
                >
                  <Icon name='eye' size='small' />
                  <Text variant='compactAction'>
                    {state.accountExportRevealed ? 'Hide key' : 'Reveal key'}
                  </Text>
                </Button>
              ) : null}
            </Inline>
            <Surface border='danger' padding='small' radius='small' tone='card'>
              <Inline align='center' gap='small'>
                <Icon name='warning' size='large' tone='danger' />
                <Text tone='danger' variant='supporting'>
                  Warning: Never disclose this key. Anyone with your private key can steal assets held in your
                  account.
                </Text>
              </Inline>
            </Surface>
          </Stack>
        </Surface>
      </Stack>
    )
  }

  function renderAccountsPanel(current: string) {
    const accounts = props.shared.accounts
    const ids = orderedAccountIds(accounts)
    const accountQuery = state.accountQuery.trim()
    const visibleIds = ids.filter((id) => accountMatchesQuery(accounts[id], accountQuery))

    return (
      <div aria-label='Accounts' className={overlayRecipe()} role='dialog'>
        {!state.accountExporting ? (
          <HeaderBar>
            <Heading level={1} variant='title'>
              Accounts
            </Heading>
            <IconButton icon='close' label='Close accounts' onPress={() => closeAccountsPanel()} />
          </HeaderBar>
        ) : null}
        {state.accountExporting ? (
          <ScrollArea height='page'>{renderPrivateKeyExport(accounts)}</ScrollArea>
        ) : state.addingAccount ? (
          <ScrollArea height='page'>
            <AddAccount
              initialSelectedSigner={overlay.type === 'accounts' ? overlay.selectedSigner : ''}
              initialType={overlay.type === 'accounts' ? overlay.newAccountType : ''}
              onClose={() => setState({ addingAccount: false })}
            />
          </ScrollArea>
        ) : (
          <>
            <div className={toolsRecipe()}>
              <SearchField
                inputRef={accountSearchInputRef}
                label='Search accounts'
                onChange={updateAccountSearch}
                onClear={clearAccountSearch}
                placeholder='Search accounts'
                value={state.accountQuery}
              />
              <Button
                appearance='control'
                label='Add account'
                onPress={() => setState({ addingAccount: true })}
                shape='pill'
                size='small'
              >
                <Icon name='plus' size='small' />
                <Text variant='compactAction'>Add account</Text>
              </Button>
            </div>
            <ScrollArea height='page'>
              <Surface padding='small' radius='none' tone='transparent'>
                <Stack gap='small'>
                  {visibleIds.map((id) => {
                    const account = accounts[id]
                    const selected = id === current
                    const navValue = accountNavValue(account)
                    const renaming = state.accountRenaming === id
                    const menuOpen = state.accountMenu === id
                    const confirmingRemove = state.accountRemoving === id
                    const confirmSeedPhraseRemoval =
                      confirmingRemove && isLastAccountForSeedPhrase(account, accounts)
                    return (
                      <div
                        aria-current={selected ? 'true' : undefined}
                        aria-label={`${accountDisplayName(account)} ${shortAddress(account.address)}`}
                        key={id}
                        className={accountRowRecipe({
                          dragging: state.draggingAccount === id,
                          dropTarget: state.dragOverAccount === id,
                          selected
                        })}
                        onDragOver={(e) => dragAccountOver(e, id)}
                        onDrop={(e) => dropAccount(e, id)}
                        onClick={() => {
                          setState({ accountsOpen: false })
                          if (!selected) void link.executeCommand({ type: 'account.select', accountId: id })
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setState({ accountsOpen: false })
                            if (!selected) void link.executeCommand({ type: 'account.select', accountId: id })
                          }
                        }}
                        role='button'
                        tabIndex={0}
                      >
                        <span
                          aria-label={`Drag ${accountDisplayName(account)} to reorder`}
                          draggable
                          onClick={(e) => e.stopPropagation()}
                          onDragEnd={() => endAccountDrag()}
                          onDragStart={(e) => startAccountDrag(e, id)}
                          title='Drag to reorder'
                        >
                          <Icon name='ellipsis' size='small' tone='muted' />
                        </span>
                        <span className={accountIconRecipe()}>{accountIcon(account, 18)}</span>
                        <Stack gap='none' grow>
                          {renaming ? (
                            <AccountRenameInput
                              ariaLabel={`Rename ${accountDisplayName(account)}`}
                              initialName={accountDisplayName(account)}
                              onCancel={() => setState({ accountRenaming: '' })}
                              onCommit={(name) => saveRenameAccount(id, name)}
                            />
                          ) : (
                            <Inline align='center' gap='xsmall'>
                              <Text variant='label' truncate>
                                {accountDisplayName(account)}
                              </Text>
                              <IconButton
                                appearance='ghost'
                                icon='edit'
                                label={`Rename ${accountDisplayName(account)}`}
                                onPress={(event) => {
                                  event.stopPropagation()
                                  startRenameAccount(account)
                                }}
                                size='small'
                              />
                            </Inline>
                          )}
                          <Text tone='muted' variant='code'>
                            {shortAddress(account.address)}
                          </Text>
                          <Text tone='accent' variant='micro'>
                            {accountTypeLabel(account)}
                          </Text>
                        </Stack>
                        <Text align='end' variant='numeric' shrink={false}>
                          {navValue}
                        </Text>
                        {selected ? <Icon name='check' size='small' tone='accent' /> : null}
                        <IconButton
                          appearance='ghost'
                          icon={state.accountCopied === id ? 'check' : 'copy'}
                          label={`Copy address for ${accountDisplayName(account)}`}
                          onPress={(event) => {
                            event.stopPropagation()
                            copyAccountAddress(account)
                          }}
                          size='small'
                        />
                        <IconButton
                          appearance='ghost'
                          expanded={menuOpen}
                          icon='ellipsis'
                          label={`${accountDisplayName(account)} account actions`}
                          onPress={(event) => {
                            event.stopPropagation()
                            setState({ accountMenu: menuOpen ? '' : id, accountRemoving: '' })
                          }}
                          size='small'
                        />
                        {menuOpen ? (
                          <div className={actionsMenuRecipe()} onClick={(e) => e.stopPropagation()}>
                            <Stack gap='xsmall'>
                              <Button
                                appearance='row'
                                onPress={() => startRenameAccount(account)}
                                size='small'
                                width='full'
                              >
                                <Text variant='caption'>Rename account</Text>
                              </Button>
                              {isHotAccount(account) ? (
                                <Button
                                  appearance='row'
                                  onPress={() => openPrivateKeyExport(account)}
                                  size='small'
                                  width='full'
                                >
                                  <Text variant='caption'>Export private key</Text>
                                </Button>
                              ) : null}
                              {confirmSeedPhraseRemoval ? (
                                <Stack gap='xsmall'>
                                  <Text variant='caption'>
                                    This is the last account using this seed phrase.
                                  </Text>
                                  <Button appearance='control' onPress={() => removeAccount(id)} size='small'>
                                    <Text variant='caption'>Keep seed phrase</Text>
                                  </Button>
                                  <Button
                                    appearance='danger'
                                    onPress={() => removeAccount(id, { removeSeedPhrase: true })}
                                    size='small'
                                  >
                                    <Text variant='caption'>Delete seed phrase</Text>
                                  </Button>
                                  <Button
                                    appearance='ghost'
                                    onPress={() => setState({ accountRemoving: '' })}
                                    size='small'
                                  >
                                    <Text variant='caption'>Cancel</Text>
                                  </Button>
                                </Stack>
                              ) : confirmingRemove ? (
                                <Button appearance='danger' onPress={() => removeAccount(id)} size='small'>
                                  <Text variant='caption'>Confirm remove</Text>
                                </Button>
                              ) : (
                                <Button
                                  appearance='danger'
                                  onPress={() => setState({ accountRemoving: id })}
                                  size='small'
                                >
                                  <Text variant='caption'>Remove account</Text>
                                </Button>
                              )}
                            </Stack>
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                  {visibleIds.length === 0 ? (
                    <Text align='center' tone='disabled' variant='overline'>
                      No Accounts Found
                    </Text>
                  ) : null}
                </Stack>
              </Surface>
            </ScrollArea>
          </>
        )}
      </div>
    )
  }

  const current = shared.currentAccount
  return renderAccountsPanel(current)
}
