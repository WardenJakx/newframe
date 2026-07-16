import React, { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import link from '../../../../../resources/link'
import svg from '../../../../../resources/svg'
import { createBalanceSummarySelector, formatUsdRate } from '../../../../../resources/domain/balance'
import { useWalletSelector } from '../../../../state/useAppSelector'
import type { WalletRendererState } from '../../../../../resources/state/projections'
import AccountRenameInput from '../../AccountRenameInput'
import { useHomeUiStore } from '../../state/HomeUiProvider'
import { AddAccount } from './AddAccount'

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
      showLocalNameWithENS: !!main.showLocalNameWithENS,
      showTestnets: !!main.showTestnets,
      signers: main.signers || EMPTY_RECORD
    }))
  )
  const props = { shared }
  const overlay = useHomeUiStore((ui) => ui.overlay)
  const closeOverlay = useHomeUiStore((ui) => ui.closeOverlay)
  const instance = useRef({
    accountFeedbackTimeout: undefined as any,
    accountSearchTimeout: undefined as any,
    accountSearchInput: null as HTMLInputElement | null
  }).current
  const balanceSelector = useRef<ReturnType<typeof createBalanceSummarySelector> | null>(null)
  if (!balanceSelector.current) balanceSelector.current = createBalanceSummarySelector()
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
      clearTimeout(instance.accountFeedbackTimeout)
      clearTimeout(instance.accountSearchTimeout)
    }
  }, [])

  function onKeyboardActivate(event: React.KeyboardEvent, action: () => void) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      action()
    }
  }

  function signerIcon(type: string, size = 16) {
    if ((type || '').toLowerCase() === 'address') return svg.eye(size)
    if (type === 'ledger') return svg.ledger(size)
    if (type === 'trezor') return svg.trezor(size)
    if (type === 'lattice') return svg.lattice(size)
    return svg.flame(size + 2)
  }

  function getBalances(address: string) {
    const rawBalances = props.shared.balances[address] || []
    const { networks, networksMeta, rates } = props.shared
    const showTestnets = props.shared.showTestnets

    return balanceSelector.current!({
      rawBalances,
      rates,
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
    clearTimeout(instance.accountSearchTimeout)
    instance.accountSearchTimeout = setTimeout(() => setState({ accountQuery: value }), 80)
  }

  function clearAccountSearch() {
    clearTimeout(instance.accountSearchTimeout)
    if (instance.accountSearchInput) instance.accountSearchInput.value = ''
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
    clearTimeout(instance.accountFeedbackTimeout)
    setState({ [key]: value })
    instance.accountFeedbackTimeout = setTimeout(() => setState({ [key]: '' }), 1800)
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
      <div className='t2PrivateKeyExport'>
        <div className='t2PrivateKeyHeader'>
          <div
            aria-label='Back to accounts'
            className='t2PrivateKeyBack'
            onClick={() => closePrivateKeyExport()}
            onKeyDown={(e) => onKeyboardActivate(e, () => closePrivateKeyExport())}
            role='button'
            tabIndex={0}
          >
            {svg.chevronLeft(14)}
          </div>
          <div className='t2PrivateKeyTitle'>Private key export</div>
        </div>
        <div className='t2PrivateKeyBody'>
          {!hasSecret ? (
            <div className='t2InlineInput t2PrivateKeyPassword'>
              <label>Newframe password</label>
              <input
                aria-label='Private key export password'
                autoFocus
                placeholder='Enter password'
                type='password'
                value={state.accountExportPassword}
                onChange={(e) => setState({ accountExportPassword: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') unlockPrivateKeyExport(account)
                }}
              />
            </div>
          ) : null}
          <div
            className={
              hasSecret && state.accountExportRevealed
                ? 't2PrivateKeyBox'
                : 't2PrivateKeyBox t2PrivateKeyBoxBlurred'
            }
          >
            {keyText}
          </div>
          {state.accountExportError ? (
            <div className='t2PrivateKeyError'>{state.accountExportError}</div>
          ) : null}
          <div className='t2PrivateKeyActions'>
            {hasSecret ? (
              <div
                aria-label='Copy private key'
                className='t2PrivateKeyAction'
                onClick={() => copyExportedPrivateKey()}
                onKeyDown={(e) => onKeyboardActivate(e, () => copyExportedPrivateKey())}
                role='button'
                tabIndex={0}
              >
                {state.accountExportCopied ? svg.check(13) : svg.copy(13)}
                <span className='traySpan'>{state.accountExportCopied ? 'Copied' : 'Copy key'}</span>
              </div>
            ) : (
              <div
                aria-label='Unlock private key export'
                className='t2PrivateKeyAction'
                onClick={() => unlockPrivateKeyExport(account)}
                onKeyDown={(e) => onKeyboardActivate(e, () => unlockPrivateKeyExport(account))}
                role='button'
                tabIndex={0}
              >
                {svg.key(13)}
                <span className='traySpan'>{state.accountExportLoading ? 'Unlocking' : 'Unlock export'}</span>
              </div>
            )}
            {hasSecret ? (
              <div
                aria-label={state.accountExportRevealed ? 'Hide private key' : 'Reveal private key'}
                className='t2PrivateKeyAction t2PrivateKeyActionSubtle'
                onClick={() => setState({ accountExportRevealed: !state.accountExportRevealed })}
                onKeyDown={(e) =>
                  onKeyboardActivate(e, () =>
                    setState({ accountExportRevealed: !state.accountExportRevealed })
                  )
                }
                role='button'
                tabIndex={0}
              >
                {svg.eye(13)}
                <span className='traySpan'>{state.accountExportRevealed ? 'Hide key' : 'Reveal key'}</span>
              </div>
            ) : null}
          </div>
        </div>
        <div className='t2PrivateKeyWarning'>
          <div className='t2PrivateKeyWarningIcon'>{svg.alert(18)}</div>
          <div>
            Warning: Never disclose this key. Anyone with your private key can steal any assets held in your
            account.
          </div>
        </div>
      </div>
    )
  }

  function renderAccountsPanel(current: string) {
    const accounts = props.shared.accounts
    const ids = orderedAccountIds(accounts)
    const accountQuery = state.accountQuery.trim()
    const visibleIds = ids.filter((id) => accountMatchesQuery(accounts[id], accountQuery))

    return (
      <div aria-label='Accounts' className='t2Overlay t2AccountsPanel cardShow' role='dialog'>
        {!state.accountExporting ? (
          <div className='t2OverlayHeader t2AccountsHeader'>
            <div className='t2AccountsTitle'>Accounts</div>
            <div
              aria-label='Close accounts'
              className='t2AccountsClose'
              onClick={() => closeAccountsPanel()}
              onKeyDown={(e) => onKeyboardActivate(e, () => closeAccountsPanel())}
              role='button'
              tabIndex={0}
            >
              {svg.x(13)}
            </div>
          </div>
        ) : null}
        {state.accountExporting ? (
          <div className='t2OverlayScroll t2AccountsScroll'>{renderPrivateKeyExport(accounts)}</div>
        ) : state.addingAccount ? (
          <div className='t2OverlayScroll t2AccountsScroll'>
            <AddAccount
              initialSelectedSigner={overlay.type === 'accounts' ? overlay.selectedSigner : ''}
              initialType={overlay.type === 'accounts' ? overlay.newAccountType : ''}
              onClose={() => setState({ addingAccount: false })}
            />
          </div>
        ) : (
          <>
            <div className='t2AccountsTools'>
              <div className='t2AccountsSearch'>
                <div className='t2AccountsSearchIcon'>{svg.search(11)}</div>
                <input
                  aria-label='Search accounts'
                  placeholder='Search accounts'
                  spellCheck='false'
                  defaultValue={state.accountQuery}
                  ref={(input) => {
                    instance.accountSearchInput = input
                  }}
                  onChange={(e) => updateAccountSearch(e.target.value)}
                />
                {state.accountQuery ? (
                  <div
                    aria-label='Clear account search'
                    className='t2AccountsSearchClear'
                    onClick={() => clearAccountSearch()}
                    onKeyDown={(e) => onKeyboardActivate(e, () => clearAccountSearch())}
                    role='button'
                    tabIndex={0}
                  >
                    {svg.x(10)}
                  </div>
                ) : null}
              </div>
              <div
                aria-label='Add account'
                className='t2AccountsAddSmall'
                onClick={() => setState({ addingAccount: true })}
                onKeyDown={(e) => onKeyboardActivate(e, () => setState({ addingAccount: true }))}
                role='button'
                tabIndex={0}
              >
                {svg.plus(12)}
                <span className='traySpan'>Add account</span>
              </div>
            </div>
            <div className='t2OverlayScroll t2AccountsScroll'>
              {visibleIds.map((id) => {
                const account = accounts[id]
                const selected = id === current
                const navValue = accountNavValue(account)
                const renaming = state.accountRenaming === id
                const menuOpen = state.accountMenu === id
                const confirmingRemove = state.accountRemoving === id
                const confirmSeedPhraseRemoval =
                  confirmingRemove && isLastAccountForSeedPhrase(account, accounts)
                const rowClass = [
                  't2AccountRow',
                  selected ? 't2AccountRowSelected' : '',
                  state.draggingAccount === id ? 't2AccountRowDragging' : '',
                  state.dragOverAccount === id ? 't2AccountRowDropTarget' : ''
                ]
                  .filter(Boolean)
                  .join(' ')
                return (
                  <div
                    aria-current={selected ? 'true' : undefined}
                    aria-label={`${accountDisplayName(account)} ${shortAddress(account.address)}`}
                    key={id}
                    className={rowClass}
                    onDragOver={(e) => dragAccountOver(e, id)}
                    onDrop={(e) => dropAccount(e, id)}
                    onClick={() => {
                      setState({ accountsOpen: false })
                      if (!selected) void link.executeCommand({ type: 'account.select', accountId: id })
                    }}
                    onKeyDown={(e) =>
                      onKeyboardActivate(e, () => {
                        setState({ accountsOpen: false })
                        if (!selected) void link.executeCommand({ type: 'account.select', accountId: id })
                      })
                    }
                    role='button'
                    tabIndex={0}
                  >
                    <div
                      aria-label={`Drag ${accountDisplayName(account)} to reorder`}
                      className='t2AccountDragHandle'
                      draggable
                      onClick={(e) => e.stopPropagation()}
                      onDragEnd={() => endAccountDrag()}
                      onDragStart={(e) => startAccountDrag(e, id)}
                      title='Drag to reorder'
                    >
                      <span className='traySpan' />
                      <span className='traySpan' />
                      <span className='traySpan' />
                      <span className='traySpan' />
                      <span className='traySpan' />
                      <span className='traySpan' />
                    </div>
                    <div className='t2AccountRowIcon'>{accountIcon(account, 18)}</div>
                    <div className='t2AccountRowInfo'>
                      {renaming ? (
                        <AccountRenameInput
                          ariaLabel={`Rename ${accountDisplayName(account)}`}
                          initialName={accountDisplayName(account)}
                          onCancel={() => setState({ accountRenaming: '' })}
                          onCommit={(name) => saveRenameAccount(id, name)}
                        />
                      ) : (
                        <div className='t2AccountRowName'>
                          {accountDisplayName(account)}
                          <div
                            aria-label={`Rename ${accountDisplayName(account)}`}
                            className='t2AccountInlineEdit'
                            onClick={(e) => {
                              e.stopPropagation()
                              startRenameAccount(account)
                            }}
                            onKeyDown={(e) => {
                              e.stopPropagation()
                              onKeyboardActivate(e, () => startRenameAccount(account))
                            }}
                            role='button'
                            tabIndex={0}
                          >
                            {svg.pencil(10)}
                          </div>
                        </div>
                      )}
                      <div className='t2AccountRowAddress'>{shortAddress(account.address)}</div>
                      <div className='t2AccountRowType'>{accountTypeLabel(account)}</div>
                    </div>
                    <div className='t2AccountRowRight'>
                      <div className='t2AccountRowValue'>{navValue}</div>
                      {selected ? <div className='t2AccountRowCheck'>{svg.check(14)}</div> : null}
                      <div
                        aria-label={`Copy address for ${accountDisplayName(account)}`}
                        className='t2AccountIconButton'
                        onClick={(e) => {
                          e.stopPropagation()
                          copyAccountAddress(account)
                        }}
                        onKeyDown={(e) => {
                          e.stopPropagation()
                          onKeyboardActivate(e, () => copyAccountAddress(account))
                        }}
                        role='button'
                        tabIndex={0}
                      >
                        {state.accountCopied === id ? svg.check(12) : svg.copy(12)}
                      </div>
                      <div
                        aria-expanded={menuOpen}
                        aria-label={`${accountDisplayName(account)} account actions`}
                        className='t2AccountIconButton'
                        onClick={(e) => {
                          e.stopPropagation()
                          setState({ accountMenu: menuOpen ? '' : id, accountRemoving: '' })
                        }}
                        onKeyDown={(e) => {
                          e.stopPropagation()
                          onKeyboardActivate(e, () =>
                            setState({ accountMenu: menuOpen ? '' : id, accountRemoving: '' })
                          )
                        }}
                        role='button'
                        tabIndex={0}
                      >
                        {svg.ellipsis(12)}
                      </div>
                    </div>
                    {menuOpen ? (
                      <div className='t2AccountActionsMenu' onClick={(e) => e.stopPropagation()}>
                        <div
                          className='t2AccountAction'
                          onClick={() => startRenameAccount(account)}
                          onKeyDown={(e) => onKeyboardActivate(e, () => startRenameAccount(account))}
                          role='button'
                          tabIndex={0}
                        >
                          Rename account
                        </div>
                        {isHotAccount(account) ? (
                          <div
                            className='t2AccountAction'
                            onClick={() => openPrivateKeyExport(account)}
                            onKeyDown={(e) => onKeyboardActivate(e, () => openPrivateKeyExport(account))}
                            role='button'
                            tabIndex={0}
                          >
                            Export private key
                          </div>
                        ) : null}
                        {confirmSeedPhraseRemoval ? (
                          <div className='t2AccountSeedPrompt'>
                            <div className='t2AccountSeedPromptTitle'>Delete seed phrase from wallet?</div>
                            <div className='t2AccountSeedPromptDetail'>
                              This is the last account using this seed phrase.
                            </div>
                            <div
                              className='t2AccountAction'
                              onClick={() => removeAccount(id)}
                              onKeyDown={(e) => onKeyboardActivate(e, () => removeAccount(id))}
                              role='button'
                              tabIndex={0}
                            >
                              Keep seed phrase
                            </div>
                            <div
                              className='t2AccountAction t2AccountActionDanger'
                              onClick={() => removeAccount(id, { removeSeedPhrase: true })}
                              onKeyDown={(e) =>
                                onKeyboardActivate(e, () => removeAccount(id, { removeSeedPhrase: true }))
                              }
                              role='button'
                              tabIndex={0}
                            >
                              Delete seed phrase
                            </div>
                            <div
                              className='t2AccountAction'
                              onClick={() => setState({ accountRemoving: '' })}
                              onKeyDown={(e) =>
                                onKeyboardActivate(e, () => setState({ accountRemoving: '' }))
                              }
                              role='button'
                              tabIndex={0}
                            >
                              Cancel
                            </div>
                          </div>
                        ) : confirmingRemove ? (
                          <div
                            className='t2AccountAction t2AccountActionDanger'
                            onClick={() => removeAccount(id)}
                            onKeyDown={(e) => onKeyboardActivate(e, () => removeAccount(id))}
                            role='button'
                            tabIndex={0}
                          >
                            Confirm remove
                          </div>
                        ) : (
                          <div
                            className='t2AccountAction t2AccountActionDanger'
                            onClick={() => setState({ accountRemoving: id })}
                            onKeyDown={(e) => onKeyboardActivate(e, () => setState({ accountRemoving: id }))}
                            role='button'
                            tabIndex={0}
                          >
                            Remove account
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                )
              })}
              {visibleIds.length === 0 ? <div className='t2EmptyState'>No Accounts Found</div> : null}
            </div>
          </>
        )}
      </div>
    )
  }

  const current = shared.currentAccount
  return renderAccountsPanel(current)
}
