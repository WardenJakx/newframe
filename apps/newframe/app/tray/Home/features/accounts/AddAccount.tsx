import React, { useEffect, useReducer, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Button } from '@newframe/ui/button'
import { Text } from '@newframe/ui/text'

import link from '../../../../../resources/link'
import svg from '../../../../../resources/svg'
import { createBalanceSummarySelector, formatUsdRate } from '../../../../../resources/domain/balance'
import { useWalletSelector } from '../../../../state/useAppSelector'

const signerTypeLabels: Record<string, string> = {
  ring: 'Hot Signer',
  seed: 'Hot Signer',
  address: 'Watch-only',
  Address: 'Watch-only',
  ledger: 'Ledger',
  trezor: 'Trezor',
  lattice: 'Lattice'
}

const inlineAddSections = [
  { section: 'createSeed', title: 'Create recovery phrase', icon: 'seedling' },
  { section: 'storedSeed', title: 'Add from stored recovery phrases', icon: 'seedling' },
  { section: 'import', title: 'Import phrase or private key', icon: 'accounts' },
  { section: 'hardware', title: 'Connect a hardware wallet', icon: 'nested' },
  { section: 'watch', title: 'Watch an address', icon: 'eye' }
]

const inlineImportTypes = [
  { type: 'seed', title: 'Recovery phrase', icon: 'seedling' },
  { type: 'privateKey', title: 'Private key', icon: 'key' },
  { type: 'keystore', title: 'JSON backup file', icon: 'file' }
]

const inlineHardwareTypes = [
  { type: 'trezor', title: 'Trezor', icon: 'trezor' },
  { type: 'ledger', title: 'Ledger', icon: 'ledger' },
  { type: 'lattice', title: 'GridPlus', icon: 'lattice' }
]

const EMPTY_RECORD: Record<string, any> = {}

interface AddAccountState {
  addAccountCategory: string
  addAccountError: string
  addAccountInput: string
  addAccountKeystore: any
  addAccountKeystorePassword: string
  addAccountName: string
  addAccountPassword: string
  addAccountSelectedSigner: string
  addAccountStatus: string
  addAccountType: string
  addGeneratedPhrase: string
  addGeneratedPhraseBackedUp: boolean
  addGeneratedPhraseCopied: boolean
  addHardwarePairCode: string
  addHardwarePhrase: string
  addHardwarePin: string
  addVaultState: { exists: boolean; unlocked: boolean } | null
  storedSeedExpanded: Record<string, boolean>
}

function addAccountReducer(state: AddAccountState, update: Partial<AddAccountState>) {
  return { ...state, ...update }
}

function operationError(result: any, fallback: string) {
  return result && 'message' in result && typeof result.message === 'string' ? result.message : fallback
}

export function AddAccount({
  initialSelectedSigner = '',
  initialType = '',
  onClose
}: {
  initialSelectedSigner?: string
  initialType?: string
  onClose: () => void
}) {
  const shared = useWalletSelector(
    useShallow((state) => ({
      accounts: state.accounts || EMPTY_RECORD,
      balances: state.balances || EMPTY_RECORD,
      networks: state.networks?.ethereum || EMPTY_RECORD,
      networksMeta: state.networksMeta?.ethereum || EMPTY_RECORD,
      rates: state.rates || EMPTY_RECORD,
      showLocalNameWithENS: !!state.showLocalNameWithENS,
      showTestnets: !!state.showTestnets,
      signers: state.signers || EMPTY_RECORD
    }))
  )
  const props = { shared }
  const instance = useRef({ seedPhraseCopiedTimeout: undefined as any }).current
  const balanceSelector = useRef<ReturnType<typeof createBalanceSummarySelector> | null>(null)
  if (!balanceSelector.current) balanceSelector.current = createBalanceSummarySelector()
  const [state, dispatch] = useReducer(addAccountReducer, {
    addAccountCategory: '',
    addAccountType: '',
    addAccountInput: '',
    addAccountName: '',
    addAccountPassword: '',
    addAccountKeystore: null,
    addAccountKeystorePassword: '',
    addAccountSelectedSigner: '',
    storedSeedExpanded: {},
    addAccountError: '',
    addAccountStatus: '',
    addGeneratedPhrase: '',
    addGeneratedPhraseBackedUp: false,
    addGeneratedPhraseCopied: false,
    addVaultState: null,
    addHardwarePin: '',
    addHardwarePhrase: '',
    addHardwarePairCode: ''
  })
  const setState = (update: any, callback?: () => void) => {
    const next = typeof update === 'function' ? update(state, props) : update
    if (next.addingAccount === false) onClose()
    const local = { ...next }
    ;['accountsOpen', 'addingAccount', 'menuOpen', 'overlay'].forEach((key) => delete local[key])
    if (Object.keys(local).length) dispatch(local as Partial<AddAccountState>)
    callback?.()
  }

  useEffect(() => {
    openInlineAdd(initialType, initialSelectedSigner)
    return () => clearTimeout(instance.seedPhraseCopiedTimeout)
  }, [])

  function onKeyboardActivate(event: React.KeyboardEvent, action: () => void) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      action()
    }
  }

  function accountDisplayName(account: any) {
    if (!account) return ''
    return account.ensName && !shared.showLocalNameWithENS ? account.ensName : account.name
  }

  function shortAddress(address = '') {
    return address ? `${address.substring(0, 5)}…${address.substring(address.length - 4)}` : ''
  }

  function accountNavValue(account: any) {
    if (!account?.address) return '---'
    const rawBalances = shared.balances[account.address]
    if (!Array.isArray(rawBalances) || rawBalances.length === 0) return '---'
    const balances = balanceSelector.current!({
      rawBalances,
      rates: shared.rates,
      networks: shared.networks,
      networksMeta: shared.networksMeta,
      includeChain: (chain) => (!chain.isTestnet || shared.showTestnets) && !!chain.on,
      cacheKey: account.address
    })
    const total = balances.reduce((sum, balance) => sum + balance.totalValue, 0)
    return `$${formatUsdRate(total, 2)}`
  }

  function seedPhraseLabel(index: number) {
    return `Seed Phrase ${index + 1}`
  }

  function seedWallets(signer: any, accounts: Record<string, any>) {
    const addresses = Array.isArray(signer?.addresses) ? signer.addresses : []

    return addresses.map((address: string, index: number) => {
      const id = address.toLowerCase()
      return { account: accounts[id], address, id, index }
    })
  }

  function walletDisplayName(wallet: { account?: any; index: number }) {
    return wallet.account ? accountDisplayName(wallet.account) : `Wallet ${wallet.index + 1}`
  }

  function expandStoredSeed(signerId: string) {
    setState({
      storedSeedExpanded: {
        ...(state.storedSeedExpanded || {}),
        [signerId]: true
      }
    })
  }

  function resetInlineAdd() {
    setState({
      addingAccount: false,
      addAccountCategory: '',
      addAccountType: '',
      addAccountInput: '',
      addAccountName: '',
      addAccountPassword: '',
      addAccountKeystore: null,
      addAccountKeystorePassword: '',
      addAccountSelectedSigner: '',
      addAccountError: '',
      addAccountStatus: '',
      addGeneratedPhrase: '',
      addGeneratedPhraseBackedUp: false,
      addGeneratedPhraseCopied: false,
      addVaultState: null,
      addHardwarePin: '',
      addHardwarePhrase: '',
      addHardwarePairCode: ''
    })
  }

  function normalizeAddAccountType(type = '') {
    const typeMap: Record<string, string> = {
      keyring: 'privateKey',
      nonsigning: 'watch'
    }

    return typeMap[type] || type
  }

  function addAccountCategoryForType(type = '') {
    if (['seed', 'privateKey', 'keystore'].includes(type)) return 'import'
    if (['ledger', 'trezor', 'lattice'].includes(type)) return 'hardware'
    if (type === 'watch') return 'watch'
    return ''
  }

  function openInlineAdd(type = '', selectedSigner = '') {
    const addAccountType = normalizeAddAccountType(type)
    const addAccountCategory = addAccountCategoryForType(addAccountType)

    setState(
      {
        overlay: null,
        menuOpen: false,
        accountsOpen: true,
        addingAccount: true,
        accountMenu: '',
        addAccountCategory,
        addAccountType,
        addAccountInput: '',
        addAccountName: addAccountType === 'lattice' ? 'GridPlus' : '',
        addAccountPassword: '',
        addAccountKeystore: null,
        addAccountKeystorePassword: '',
        addAccountSelectedSigner: selectedSigner || '',
        addAccountError: '',
        addAccountStatus: '',
        addGeneratedPhrase: '',
        addGeneratedPhraseBackedUp: false,
        addGeneratedPhraseCopied: false,
        addHardwarePin: '',
        addHardwarePhrase: '',
        addHardwarePairCode: ''
      },
      () => refreshAddVaultState()
    )
  }

  async function refreshAddVaultState() {
    const status = await link.executeQuery({ type: 'security.status' })
    if (status.ok) {
      setState({
        addVaultState: { exists: status.vaultExists, unlocked: !status.locked }
      })
    } else {
      setState({ addVaultState: { exists: false, unlocked: false } })
    }
  }

  function backInlineAdd() {
    if (state.addAccountSelectedSigner) {
      return setState({ addAccountSelectedSigner: '', addAccountError: '', addAccountStatus: '' })
    }

    if (state.addAccountCategory) {
      return setState({
        addAccountCategory: '',
        addAccountType: '',
        addAccountInput: '',
        addAccountName: '',
        addAccountPassword: '',
        addAccountKeystore: null,
        addAccountKeystorePassword: '',
        addAccountError: '',
        addAccountStatus: '',
        addGeneratedPhrase: '',
        addGeneratedPhraseBackedUp: false,
        addGeneratedPhraseCopied: false,
        addHardwarePin: '',
        addHardwarePhrase: '',
        addHardwarePairCode: ''
      })
    }

    resetInlineAdd()
  }

  function chooseInlineAddCategory(category: string) {
    const addAccountType = category === 'watch' ? 'watch' : category === 'createSeed' ? 'seed' : ''

    setState(
      {
        addAccountCategory: category,
        addAccountType,
        addAccountInput: '',
        addAccountName: '',
        addAccountPassword: '',
        addAccountKeystore: null,
        addAccountKeystorePassword: '',
        addAccountSelectedSigner: '',
        addAccountError: '',
        addAccountStatus: '',
        addGeneratedPhrase: '',
        addGeneratedPhraseBackedUp: false,
        addGeneratedPhraseCopied: false,
        addHardwarePin: '',
        addHardwarePhrase: '',
        addHardwarePairCode: ''
      },
      () => {
        if (category === 'createSeed') generateInlineSeedPhrase()
      }
    )
  }

  function chooseInlineAddType(type: string) {
    setState({
      addAccountType: type,
      addAccountInput: '',
      addAccountName: '',
      addAccountPassword: '',
      addAccountKeystore: null,
      addAccountKeystorePassword: '',
      addAccountError: '',
      addAccountStatus: '',
      addGeneratedPhrase: '',
      addGeneratedPhraseBackedUp: false,
      addGeneratedPhraseCopied: false,
      addHardwarePin: '',
      addHardwarePhrase: '',
      addHardwarePairCode: ''
    })
  }

  function addErrorMessage(err: any) {
    return err?.message || String(err)
  }

  function isHotInlineImport(type = state.addAccountType) {
    return ['privateKey', 'seed', 'keystore'].includes(type)
  }

  function needsFramePassword() {
    return isHotInlineImport() && (!state.addVaultState || !state.addVaultState.unlocked)
  }

  function framePasswordLabel() {
    return state.addVaultState && state.addVaultState.exists
      ? 'Newframe password'
      : 'Create Newframe password'
  }

  async function createStoredSeedAccount(signer: any, address: string) {
    const accounts = props.shared.accounts
    const id = address.toLowerCase()

    if (accounts[id]) {
      await link.executeCommand({ type: 'account.select', accountId: id })
      return resetInlineAdd()
    }

    setState({ addAccountError: '', addAccountStatus: 'Adding account' })

    const result = await link.executeCommand({
      type: 'account.add-from-signer',
      signerId: signer.id,
      address,
      name: 'Hot Account'
    })
    if (result.ok) {
      resetInlineAdd()
    } else {
      setState({
        addAccountError: operationError(result, 'Could not add the account.'),
        addAccountStatus: ''
      })
    }
  }

  async function locateInlineKeystore() {
    setState({ addAccountError: '', addAccountStatus: 'Selecting JSON backup file' })

    const result = await link.executeCommand({ type: 'keystore.locate' })
    if (result.ok) {
      setState({
        addAccountKeystore: result.keystore,
        addAccountError: '',
        addAccountStatus: 'JSON backup file selected'
      })
    } else {
      setState({
        addAccountKeystore: null,
        addAccountError: operationError(result, 'Could not select the keystore.'),
        addAccountStatus: ''
      })
    }
  }

  function selectHardwareSigner(signerId: string) {
    setState({
      addAccountSelectedSigner: signerId,
      addAccountError: '',
      addAccountStatus: '',
      addHardwarePin: '',
      addHardwarePhrase: '',
      addHardwarePairCode: ''
    })
  }

  async function createLatticeSigner() {
    const deviceId = (state.addAccountInput || '').trim()
    const deviceName = (state.addAccountName || '').trim() || 'GridPlus'

    if (!deviceId) return setState({ addAccountError: 'Device ID required' })

    setState({ addAccountError: '', addAccountStatus: 'Creating Lattice signer' })

    const result = await link.executeCommand({
      type: 'signer.lattice-create',
      deviceId,
      deviceName
    })
    if (result.ok) {
      setState({
        addAccountStatus: 'Connecting to GridPlus',
        addAccountInput: '',
        addAccountName: 'GridPlus',
        addAccountSelectedSigner: result.signerId
      })
    } else {
      setState({
        addAccountError: operationError(result, 'Could not create the GridPlus signer.'),
        addAccountStatus: ''
      })
    }
  }

  function hardwareAccountName(signer: any) {
    const label = signerTypeLabels[signer?.type] || signer?.type || 'Hardware'
    return `${label} Account`
  }

  async function addHardwareAccount(signer: any, address: string) {
    const id = (address || '').toLowerCase()
    if (!signer?.type || !id) return

    const accounts = props.shared.accounts

    if (accounts[id]) {
      await link.executeCommand({ type: 'account.select', accountId: id })
      return resetInlineAdd()
    }

    setState({ addAccountError: '', addAccountStatus: 'Adding account' })

    const result = await link.executeCommand({
      type: 'account.add-from-signer',
      signerId: signer.id,
      address,
      name: hardwareAccountName(signer)
    })
    if (result.ok) resetInlineAdd()
    else {
      setState({
        addAccountError: operationError(result, 'Could not add the hardware account.'),
        addAccountStatus: ''
      })
    }
  }

  function reloadHardwareSigner(signer: any) {
    if (!signer?.id) return
    void link.executeCommand({ type: 'signer.reload', signerId: signer.id })
    setState({ addAccountError: '', addAccountStatus: 'Connecting hardware wallet' })
  }

  function removeHardwareSigner(signer: any) {
    if (!signer?.id) return
    void link.executeCommand({ type: 'signer.disconnect', signerId: signer.id })
    setState({ addAccountSelectedSigner: '', addAccountError: '', addAccountStatus: '' })
  }

  function addHardwarePinDigit(num: number) {
    setState({ addHardwarePin: `${state.addHardwarePin || ''}${num}` })
  }

  function backspaceHardwarePin() {
    setState({ addHardwarePin: (state.addHardwarePin || '').slice(0, -1) })
  }

  function submitHardwarePin(signer: any) {
    if (!signer?.id) return
    if (!state.addHardwarePin) return setState({ addAccountError: 'PIN required' })

    void link.executeCommand({
      type: 'signer.trezor-input',
      signerId: signer.id,
      input: 'pin',
      value: state.addHardwarePin
    })
    setState({ addHardwarePin: '', addAccountError: '', addAccountStatus: 'PIN submitted' })
  }

  function submitHardwarePhrase(signer: any) {
    if (!signer?.id) return
    void link.executeCommand({
      type: 'signer.trezor-input',
      signerId: signer.id,
      input: 'passphrase',
      value: state.addHardwarePhrase || ''
    })
    setState({ addHardwarePhrase: '', addAccountError: '', addAccountStatus: 'Passphrase submitted' })
  }

  function submitHardwarePhraseOnDevice(signer: any) {
    if (!signer?.id) return
    void link.executeCommand({
      type: 'signer.trezor-input',
      signerId: signer.id,
      input: 'device-passphrase'
    })
    setState({ addAccountError: '', addAccountStatus: 'Continue on device' })
  }

  async function pairHardwareLattice(signer: any) {
    if (!signer?.id) return
    if (!state.addHardwarePairCode) return setState({ addAccountError: 'Pairing code required' })

    const result = await link.executeCommand({
      type: 'signer.lattice-pair',
      signerId: signer.id,
      pairCode: state.addHardwarePairCode
    })
    if (result.ok) {
      setState({ addHardwarePairCode: '', addAccountError: '', addAccountStatus: 'GridPlus paired' })
    } else {
      setState({
        addAccountError: operationError(result, 'Could not pair GridPlus.'),
        addAccountStatus: ''
      })
    }
  }

  async function createInlineAccount() {
    const {
      addAccountType,
      addAccountInput,
      addAccountName,
      addAccountPassword,
      addAccountKeystore,
      addAccountKeystorePassword
    } = state
    const input = (addAccountInput || '').trim()
    const name = (addAccountName || '').trim()

    if (!addAccountType) return setState({ addAccountError: 'Choose an account type' })
    if (addAccountType !== 'keystore' && !input) {
      return setState({ addAccountError: 'Account input required' })
    }
    if (needsFramePassword() && !addAccountPassword) {
      return setState({ addAccountError: `${framePasswordLabel()} required` })
    }

    setState({ addAccountError: '', addAccountStatus: 'Adding account' })

    try {
      const result =
        addAccountType === 'watch'
          ? await link.executeCommand({
              type: 'account.watch-add',
              addressOrName: input,
              name: name || 'Watch Account'
            })
          : addAccountType === 'keystore'
            ? addAccountKeystore && addAccountKeystorePassword
              ? await link.executeCommand({
                  type: 'signer.import',
                  source: 'keystore',
                  keystore: addAccountKeystore,
                  keystorePassword: addAccountKeystorePassword,
                  framePassword: addAccountPassword,
                  accountName: name || 'Hot Account'
                })
              : null
            : await link.executeCommand(
                addAccountType === 'seed'
                  ? {
                      type: 'signer.import',
                      source: 'phrase',
                      phrase: input,
                      framePassword: addAccountPassword,
                      accountName: name || 'Hot Account'
                    }
                  : {
                      type: 'signer.import',
                      source: 'private-key',
                      privateKey: input,
                      framePassword: addAccountPassword,
                      accountName: name || 'Hot Account'
                    }
              )

      if (!result) {
        const message = addAccountKeystore
          ? 'JSON backup file password required'
          : 'Choose a JSON backup file'
        return setState({ addAccountError: message, addAccountStatus: '' })
      }
      if (!result.ok) throw new Error(operationError(result, 'Could not add the account.'))
      resetInlineAdd()
    } catch (err: any) {
      setState({ addAccountError: addErrorMessage(err), addAccountStatus: '' })
    }
  }

  async function generateInlineSeedPhrase() {
    setState({
      addAccountError: '',
      addAccountStatus: 'Generating recovery phrase',
      addGeneratedPhrase: '',
      addGeneratedPhraseBackedUp: false,
      addGeneratedPhraseCopied: false
    })

    const result = await link.executeQuery({ type: 'seed.generate' })
    if (result.ok) {
      setState({
        addGeneratedPhrase: result.phrase,
        addAccountError: '',
        addAccountStatus: ''
      })
    } else {
      setState({
        addAccountError: operationError(result, 'Could not generate a recovery phrase.'),
        addAccountStatus: '',
        addGeneratedPhrase: ''
      })
    }
  }

  function copyGeneratedSeedPhrase() {
    const phrase = state.addGeneratedPhrase
    if (!phrase) return

    clearTimeout(instance.seedPhraseCopiedTimeout)
    void link.executeCommand({ type: 'clipboard.write', text: phrase })
    setState({ addGeneratedPhraseCopied: true })
    instance.seedPhraseCopiedTimeout = setTimeout(() => setState({ addGeneratedPhraseCopied: false }), 1800)
  }

  async function createGeneratedSeedAccount() {
    const phrase = (state.addGeneratedPhrase || '').trim()
    const name = (state.addAccountName || '').trim()
    const password = state.addAccountPassword || ''

    if (!phrase) return setState({ addAccountError: 'Generate a recovery phrase first' })
    if (!state.addGeneratedPhraseBackedUp) {
      return setState({ addAccountError: 'Confirm that you saved the recovery phrase' })
    }
    if (needsFramePassword() && !password) {
      return setState({ addAccountError: `${framePasswordLabel()} required` })
    }

    setState({ addAccountError: '', addAccountStatus: 'Creating account' })

    const result = await link.executeCommand({
      type: 'signer.import',
      source: 'phrase',
      phrase,
      framePassword: password,
      accountName: name || 'Hot Account'
    })
    if (result.ok) resetInlineAdd()
    else {
      setState({
        addAccountError: operationError(result, 'Could not create the account.'),
        addAccountStatus: ''
      })
    }
  }

  function renderInlineAddIcon(icon: string, size = 15) {
    const iconFn = (svg as any)[icon]
    return iconFn ? iconFn(size) : svg.accounts(size)
  }

  function renderInlineAddOption({
    active = false,
    icon,
    label,
    onClick,
    optionKey
  }: {
    active?: boolean
    icon: string
    label: string
    onClick: () => void
    optionKey?: string
  }) {
    return (
      <div
        aria-pressed={active}
        aria-label={label}
        className={active ? 't2InlineAddType t2InlineAddTypeSelected' : 't2InlineAddType'}
        key={optionKey}
        onClick={onClick}
        onKeyDown={(e) => onKeyboardActivate(e, onClick)}
        role='button'
        tabIndex={0}
      >
        <div className='t2InlineAddTypeIcon'>{renderInlineAddIcon(icon)}</div>
        <span className='traySpan'>{label}</span>
      </div>
    )
  }

  function renderInlineAddRoot() {
    return (
      <div className='t2InlineAddTypes'>
        {inlineAddSections.map((option) =>
          renderInlineAddOption({
            active: state.addAccountCategory === option.section,
            icon: option.icon,
            label: option.title,
            onClick: () => chooseInlineAddCategory(option.section),
            optionKey: option.section
          })
        )}
      </div>
    )
  }

  function renderStoredSeedOption(signer: any, seedIndex: number, accounts: Record<string, any>) {
    const wallets = seedWallets(signer, accounts)
    const importedWallets = wallets.filter((wallet: any) => wallet.account)
    const expanded = !!state.storedSeedExpanded?.[signer.id]
    const visibleWallets = expanded ? importedWallets : importedWallets.slice(0, 3)
    const importedCount = importedWallets.length
    const label = seedPhraseLabel(seedIndex)
    const hasMoreWallets = importedWallets.length > 3

    return (
      <div aria-label={`View ${label} wallets`} className='t2StoredSeedCard' key={signer.id}>
        <div className='t2StoredSeedHeader'>
          <div className='t2StoredSeedIcon'>{renderInlineAddIcon('seedling')}</div>
          <div className='t2StoredSeedTitle'>{label}</div>
          <div className='t2StoredSeedCount'>{`${importedCount}/${wallets.length}`}</div>
        </div>
        <div className='t2StoredSeedWallets'>
          {visibleWallets.map((wallet: any) => (
            <div className='t2StoredSeedWallet' key={wallet.address}>
              <div className='t2StoredSeedWalletName'>{walletDisplayName(wallet)}</div>
              <div className='t2StoredSeedWalletAddress'>{shortAddress(wallet.address)}</div>
            </div>
          ))}
          {hasMoreWallets && !expanded ? (
            <div
              aria-label={`Show all ${label} wallets`}
              className='t2StoredSeedMore'
              onClick={(e) => {
                e.stopPropagation()
                expandStoredSeed(signer.id)
              }}
              onKeyDown={(e) => {
                e.stopPropagation()
                onKeyboardActivate(e, () => expandStoredSeed(signer.id))
              }}
              role='button'
              tabIndex={0}
            >
              <span className='traySpan'>More wallets</span>
              {svg.chevron(12)}
            </div>
          ) : null}
          <div
            aria-label={`Add address from ${label}`}
            className='t2StoredSeedAddAddress'
            onClick={() => setState({ addAccountSelectedSigner: signer.id })}
            onKeyDown={(e) => onKeyboardActivate(e, () => setState({ addAccountSelectedSigner: signer.id }))}
            role='button'
            tabIndex={0}
          >
            {svg.plus(12)}
            <span className='traySpan'>Add address</span>
          </div>
        </div>
      </div>
    )
  }

  function renderStoredSeedAdd() {
    const signers = Object.values(props.shared.signers).filter((signer: any) => signer.type === 'seed')
    const accounts = props.shared.accounts
    const selectedSigner = state.addAccountSelectedSigner
      ? props.shared.signers[state.addAccountSelectedSigner]
      : null

    if (!signers.length) {
      return (
        <div className='t2InlineAddEmpty'>
          <div>No stored recovery phrases</div>
          <div
            aria-label='Create recovery phrase'
            className='t2InlineAddSubmit'
            onClick={() => chooseInlineAddCategory('createSeed')}
            onKeyDown={(e) => onKeyboardActivate(e, () => chooseInlineAddCategory('createSeed'))}
            role='button'
            tabIndex={0}
          >
            {svg.plus(12)}
            <span className='traySpan'>Create recovery phrase</span>
          </div>
          <div
            aria-label='Import recovery phrase'
            className='t2InlineAddSubmit t2InlineAddSubmitSubtle'
            onClick={() =>
              setState({
                addAccountCategory: 'import',
                addAccountType: 'seed',
                addGeneratedPhrase: '',
                addGeneratedPhraseBackedUp: false,
                addGeneratedPhraseCopied: false
              })
            }
            onKeyDown={(e) =>
              onKeyboardActivate(e, () =>
                setState({
                  addAccountCategory: 'import',
                  addAccountType: 'seed',
                  addGeneratedPhrase: '',
                  addGeneratedPhraseBackedUp: false,
                  addGeneratedPhraseCopied: false
                })
              )
            }
            role='button'
            tabIndex={0}
          >
            {svg.seedling(12)}
            <span className='traySpan'>Import recovery phrase</span>
          </div>
        </div>
      )
    }

    if (!selectedSigner) {
      return (
        <div className='t2StoredSeedCards'>
          {signers.map((signer: any, seedIndex: number) =>
            renderStoredSeedOption(signer, seedIndex, accounts)
          )}
        </div>
      )
    }

    return (
      <div className='t2DerivedAccounts'>
        {selectedSigner.addresses.map((address: string, index: number) => {
          const id = address.toLowerCase()
          const account = accounts[id]
          const imported = !!account
          const wallet = { account, address, id, index }
          return (
            <div
              aria-label={`${imported ? 'Select' : 'Add'} ${walletDisplayName(wallet)}`}
              className={imported ? 't2DerivedAccountRow t2DerivedAccountImported' : 't2DerivedAccountRow'}
              key={address}
              onClick={() => createStoredSeedAccount(selectedSigner, address)}
              onKeyDown={(e) => onKeyboardActivate(e, () => createStoredSeedAccount(selectedSigner, address))}
              role='button'
              tabIndex={0}
            >
              <div className='t2DerivedAccountIndex'>{index + 1}.</div>
              <div className='t2DerivedAccountIdentity'>
                <div className='t2DerivedAccountName'>{walletDisplayName(wallet)}</div>
                <div className='t2DerivedAccountAddress'>{shortAddress(address)}</div>
              </div>
              <div className='t2DerivedAccountValue'>
                {imported ? accountNavValue(accounts[id]) : '$0.00'}
              </div>
              {imported ? <div className='t2DerivedAccountBadge'>Imported</div> : null}
              <div className='t2DerivedAccountCheck'>{imported ? svg.check(11) : null}</div>
            </div>
          )
        })}
      </div>
    )
  }

  function renderCreateSeedPhrase() {
    const phrase = (state.addGeneratedPhrase || '').trim()
    const words = phrase ? phrase.split(/\s+/) : []

    return (
      <div className='t2InlineAddForm'>
        <div className='t2SeedCreateNotice'>
          <div className='t2SeedCreateNoticeIcon'>{svg.alert(14)}</div>
          <span className='traySpan'>Save these words in order. Newframe cannot recover them later.</span>
        </div>
        {words.length ? (
          <div className='t2SeedPhraseGrid' aria-label='Generated recovery phrase'>
            {words.map((word: string, index: number) => (
              <div className='t2SeedPhraseWord' key={`${word}-${index}`}>
                <span className='traySpan'>{index + 1}</span>
                <strong>{word}</strong>
              </div>
            ))}
          </div>
        ) : (
          <div className='t2InlineAddEmpty'>
            <div>{state.addAccountStatus || 'Preparing recovery phrase'}</div>
          </div>
        )}
        <div className='t2SeedPhraseActions'>
          <Button
            appearance='control'
            label='Copy recovery phrase'
            onPress={() => copyGeneratedSeedPhrase()}
            shape='pill'
            size='small'
          >
            <Text variant='compactAction'>{state.addGeneratedPhraseCopied ? 'Copied' : 'Copy'}</Text>
          </Button>
          <Button
            appearance='control'
            label='Generate new recovery phrase'
            onPress={() => generateInlineSeedPhrase()}
            shape='pill'
            size='small'
          >
            <Text variant='compactAction'>New phrase</Text>
          </Button>
        </div>
        <div
          aria-checked={state.addGeneratedPhraseBackedUp}
          aria-label='Recovery phrase saved'
          className={
            state.addGeneratedPhraseBackedUp ? 't2SeedBackupCheck t2SeedBackupCheckOn' : 't2SeedBackupCheck'
          }
          onClick={() => setState({ addGeneratedPhraseBackedUp: !state.addGeneratedPhraseBackedUp })}
          onKeyDown={(e) =>
            onKeyboardActivate(e, () =>
              setState({ addGeneratedPhraseBackedUp: !state.addGeneratedPhraseBackedUp })
            )
          }
          role='checkbox'
          tabIndex={0}
        >
          <div className='t2SeedBackupBox'>{state.addGeneratedPhraseBackedUp ? svg.check(9) : null}</div>
          <span className='traySpan'>I saved this recovery phrase</span>
        </div>
        <div className='t2InlineInput'>
          <label>Account name</label>
          <input
            aria-label='Account name'
            spellCheck='false'
            value={state.addAccountName}
            onChange={(e) => setState({ addAccountName: e.target.value })}
          />
        </div>
        {needsFramePassword() ? (
          <div className='t2InlineInput'>
            <label>{framePasswordLabel()}</label>
            <input
              aria-label={framePasswordLabel()}
              spellCheck='false'
              type='password'
              value={state.addAccountPassword}
              onChange={(e) => setState({ addAccountPassword: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') createGeneratedSeedAccount()
              }}
            />
          </div>
        ) : null}
        {state.addAccountError ? <div className='t2InlineAddError'>{state.addAccountError}</div> : null}
        {state.addAccountStatus && words.length ? (
          <div className='t2InlineAddStatus'>{state.addAccountStatus}</div>
        ) : null}
        <div
          aria-label='Create account'
          className='t2InlineAddSubmit'
          onClick={() => createGeneratedSeedAccount()}
          onKeyDown={(e) => onKeyboardActivate(e, () => createGeneratedSeedAccount())}
          role='button'
          tabIndex={0}
        >
          {svg.plus(12)}
          <span className='traySpan'>Create account</span>
        </div>
      </div>
    )
  }

  function renderImportOptions() {
    if (state.addAccountType) return renderInlineAddForm()

    return (
      <div className='t2InlineAddTypes'>
        {inlineImportTypes.map((option) =>
          renderInlineAddOption({
            active: state.addAccountType === option.type,
            icon: option.icon,
            label: option.title,
            onClick: () => chooseInlineAddType(option.type),
            optionKey: option.type
          })
        )}
      </div>
    )
  }

  function renderHardwareOptions() {
    if (state.addAccountType) return renderHardwareAdd()

    return (
      <div className='t2InlineAddTypes'>
        {inlineHardwareTypes.map((option) =>
          renderInlineAddOption({
            icon: option.icon,
            label: option.title,
            onClick: () => chooseInlineAddType(option.type),
            optionKey: option.type
          })
        )}
      </div>
    )
  }

  function renderHardwareAdd() {
    const type = state.addAccountType
    const signers = Object.values(props.shared.signers).filter((signer: any) => signer.type === type)
    const selectedSigner = state.addAccountSelectedSigner
      ? props.shared.signers[state.addAccountSelectedSigner]
      : null
    const title = type === 'ledger' ? 'Ledger' : type === 'trezor' ? 'Trezor' : 'GridPlus'

    if (selectedSigner && selectedSigner.type === type) {
      return renderHardwareSignerDetails(selectedSigner, title)
    }

    return (
      <div className='t2InlineAddForm'>
        {signers.length === 0 ? (
          <div className='t2InlineAddEmpty'>
            <div>{`Unlock your ${title} to get started`}</div>
            {type === 'lattice' ? null : (
              <div className='t2InlineAddStatus'>{`${title} will appear here when detected`}</div>
            )}
          </div>
        ) : (
          <div className='t2DerivedAccounts'>
            {signers.map((signer: any) => {
              const addressCount = Array.isArray(signer.addresses) ? signer.addresses.length : 0
              return (
                <div
                  aria-label={`View ${signer.name || title} accounts`}
                  className='t2DerivedAccountRow'
                  key={signer.id}
                  onClick={() => selectHardwareSigner(signer.id)}
                  onKeyDown={(e) => onKeyboardActivate(e, () => selectHardwareSigner(signer.id))}
                  role='button'
                  tabIndex={0}
                >
                  <div className='t2DerivedAccountIndex'>
                    {renderInlineAddIcon(
                      type === 'ledger' ? 'ledger' : type === 'trezor' ? 'trezor' : 'lattice',
                      14
                    )}
                  </div>
                  <div className='t2DerivedAccountAddress'>{signer.name || title}</div>
                  <div className='t2DerivedAccountValue'>{signer.status || 'Detected'}</div>
                  <div className='t2DerivedAccountBadge'>{`${addressCount} accounts`}</div>
                  <div className='t2DerivedAccountCheck'>{svg.arrowRight(11)}</div>
                </div>
              )
            })}
          </div>
        )}
        {type === 'lattice' ? renderLatticeAdd() : null}
      </div>
    )
  }

  function renderLatticeAdd() {
    return (
      <div className='t2LatticeCreateForm'>
        <div className='t2InlineInput'>
          <label>Device name</label>
          <input
            aria-label='Lattice device name'
            spellCheck='false'
            value={state.addAccountName}
            onChange={(e) =>
              setState({ addAccountName: e.target.value.replace(/\s+/g, '-').substring(0, 14) })
            }
          />
        </div>
        <div className='t2InlineInput'>
          <label>Device ID</label>
          <input
            aria-label='Lattice device ID'
            spellCheck='false'
            value={state.addAccountInput}
            onChange={(e) => setState({ addAccountInput: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') createLatticeSigner()
            }}
          />
        </div>
        {state.addAccountError ? <div className='t2InlineAddError'>{state.addAccountError}</div> : null}
        {state.addAccountStatus ? <div className='t2InlineAddStatus'>{state.addAccountStatus}</div> : null}
        <div
          aria-label='Create Lattice signer'
          className='t2InlineAddSubmit'
          onClick={() => createLatticeSigner()}
          onKeyDown={(e) => onKeyboardActivate(e, () => createLatticeSigner())}
          role='button'
          tabIndex={0}
        >
          {svg.plus(12)}
          <span className='traySpan'>Create signer</span>
        </div>
      </div>
    )
  }

  function renderHardwareSignerDetails(signer: any, title: string) {
    const addresses = Array.isArray(signer.addresses) ? signer.addresses : []
    const status = (signer.status || '').toLowerCase()
    const loading = ['loading', 'connecting', 'addresses', 'input', 'pairing', 'deriving'].some((part) =>
      status.includes(part)
    )

    return (
      <div className='t2InlineAddForm'>
        <div className='t2HardwareSignerHeader'>
          <div className='t2HardwareSignerIcon'>{renderInlineAddIcon(signer.type, 16)}</div>
          <div className='t2HardwareSignerText'>
            <div className='t2HardwareSignerName'>{signer.name || title}</div>
            <div className='t2HardwareSignerStatus'>{signer.status || 'Detected'}</div>
          </div>
          {loading ? <div className='loader' /> : null}
        </div>
        {renderHardwareSignerAction(signer, status)}
        {addresses.length ? (
          <div className='t2DerivedAccounts'>
            {addresses.map((address: string, index: number) => {
              const id = address.toLowerCase()
              const accounts = props.shared.accounts
              const imported = !!accounts[id]
              return (
                <div
                  aria-label={`${imported ? 'Select' : 'Add'} ${shortAddress(address)}`}
                  className={
                    imported ? 't2DerivedAccountRow t2DerivedAccountImported' : 't2DerivedAccountRow'
                  }
                  key={address}
                  onClick={() => addHardwareAccount(signer, address)}
                  onKeyDown={(e) => onKeyboardActivate(e, () => addHardwareAccount(signer, address))}
                  role='button'
                  tabIndex={0}
                >
                  <div className='t2DerivedAccountIndex'>{index + 1}.</div>
                  <div className='t2DerivedAccountAddress'>{shortAddress(address)}</div>
                  <div className='t2DerivedAccountValue'>
                    {imported ? accountNavValue(accounts[id]) : '$0.00'}
                  </div>
                  {imported ? <div className='t2DerivedAccountBadge'>Imported</div> : null}
                  <div className='t2DerivedAccountCheck'>{imported ? svg.check(11) : null}</div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className='t2InlineAddEmpty'>
            <div>{loading ? 'Loading accounts' : 'No accounts loaded yet'}</div>
          </div>
        )}
        {state.addAccountError ? <div className='t2InlineAddError'>{state.addAccountError}</div> : null}
        {state.addAccountStatus ? <div className='t2InlineAddStatus'>{state.addAccountStatus}</div> : null}
        <div className='t2HardwareActions'>
          <Button
            appearance='control'
            label={`Reconnect ${title}`}
            onPress={() => reloadHardwareSigner(signer)}
            shape='pill'
            size='small'
          >
            <Text variant='compactAction'>Reconnect</Text>
          </Button>
          <Button
            appearance='danger'
            label={`Remove ${title}`}
            onPress={() => removeHardwareSigner(signer)}
            shape='pill'
            size='small'
          >
            <Text variant='compactAction'>Remove</Text>
          </Button>
        </div>
      </div>
    )
  }

  function renderHardwareSignerAction(signer: any, status: string) {
    if (signer.type === 'trezor' && status === 'need pin') {
      return (
        <div className='t2HardwareChallenge'>
          <div className='t2HardwarePinDots'>
            {(state.addHardwarePin || '').split('').map((_: string, index: number) => (
              <span className='traySpan' key={index} />
            ))}
          </div>
          <div className='t2HardwarePinPad'>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
              <div
                aria-label={`PIN position ${num}`}
                className='t2HardwarePinButton'
                key={num}
                onClick={() => addHardwarePinDigit(num)}
                onKeyDown={(e) => onKeyboardActivate(e, () => addHardwarePinDigit(num))}
                role='button'
                tabIndex={0}
              >
                {svg.octicon('primitive-dot', { height: 18 })}
              </div>
            ))}
          </div>
          <div className='t2HardwareActions'>
            <Button
              appearance='control'
              label='Submit Trezor PIN'
              onPress={() => submitHardwarePin(signer)}
              shape='pill'
              size='small'
            >
              <Text variant='compactAction'>Submit PIN</Text>
            </Button>
            <Button
              appearance='control'
              label='Delete PIN digit'
              onPress={() => backspaceHardwarePin()}
              shape='pill'
              size='small'
            >
              <Text variant='compactAction'>Delete</Text>
            </Button>
          </div>
        </div>
      )
    }

    if (signer.type === 'trezor' && status === 'enter passphrase') {
      const allowsDeviceEntry = (signer.capabilities || []).includes('Capability_PassphraseEntry')

      return (
        <div className='t2HardwareChallenge'>
          <div className='t2InlineInput'>
            <label>Passphrase</label>
            <input
              aria-label='Trezor passphrase'
              spellCheck='false'
              type='password'
              value={state.addHardwarePhrase}
              onChange={(e) => setState({ addHardwarePhrase: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitHardwarePhrase(signer)
              }}
            />
          </div>
          <div className='t2HardwareActions'>
            <Button
              appearance='control'
              label='Submit Trezor passphrase'
              onPress={() => submitHardwarePhrase(signer)}
              shape='pill'
              size='small'
            >
              <Text variant='compactAction'>Submit</Text>
            </Button>
            {allowsDeviceEntry ? (
              <Button
                appearance='control'
                label='Enter passphrase on Trezor'
                onPress={() => submitHardwarePhraseOnDevice(signer)}
                shape='pill'
                size='small'
              >
                <Text variant='compactAction'>On device</Text>
              </Button>
            ) : null}
          </div>
        </div>
      )
    }

    if (signer.type === 'lattice' && status === 'pair') {
      return (
        <div className='t2HardwareChallenge'>
          <div className='t2InlineInput'>
            <label>Pairing code</label>
            <input
              aria-label='GridPlus pairing code'
              spellCheck='false'
              value={state.addHardwarePairCode}
              onChange={(e) => setState({ addHardwarePairCode: (e.target.value || '').toUpperCase() })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') pairHardwareLattice(signer)
              }}
            />
          </div>
          <div
            aria-label='Pair GridPlus'
            className='t2InlineAddSubmit'
            onClick={() => pairHardwareLattice(signer)}
            onKeyDown={(e) => onKeyboardActivate(e, () => pairHardwareLattice(signer))}
            role='button'
            tabIndex={0}
          >
            {svg.check(12)}
            <span className='traySpan'>Pair</span>
          </div>
        </div>
      )
    }

    return null
  }

  function renderInlineAddForm() {
    const inputLabel =
      state.addAccountType === 'watch'
        ? 'Address or gns/ens name'
        : state.addAccountType === 'seed'
          ? 'Recovery phrase'
          : 'Private key'
    const showAccountInput = state.addAccountType !== 'keystore'

    return (
      <div className='t2InlineAddForm'>
        {showAccountInput ? (
          <div className='t2InlineInput'>
            <label>{inputLabel}</label>
            {state.addAccountType === 'seed' ? (
              <textarea
                aria-label={inputLabel}
                spellCheck='false'
                value={state.addAccountInput}
                onChange={(e) => setState({ addAccountInput: e.target.value })}
              />
            ) : (
              <input
                aria-label={inputLabel}
                spellCheck='false'
                value={state.addAccountInput}
                onChange={(e) => setState({ addAccountInput: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') createInlineAccount()
                }}
              />
            )}
          </div>
        ) : (
          <div
            aria-label='Choose JSON backup file'
            className='t2InlineAddFile'
            onClick={() => locateInlineKeystore()}
            onKeyDown={(e) => onKeyboardActivate(e, () => locateInlineKeystore())}
            role='button'
            tabIndex={0}
          >
            <div className='t2InlineAddFileIcon'>{svg.file(14)}</div>
            <span className='traySpan'>
              {state.addAccountKeystore ? 'JSON backup file selected' : 'Choose JSON backup file'}
            </span>
          </div>
        )}
        {state.addAccountType === 'keystore' ? (
          <div className='t2InlineInput'>
            <label>JSON backup file password</label>
            <input
              aria-label='JSON backup file password'
              spellCheck='false'
              type='password'
              value={state.addAccountKeystorePassword}
              onChange={(e) => setState({ addAccountKeystorePassword: e.target.value })}
            />
          </div>
        ) : null}
        <div className='t2InlineInput'>
          <label>Account name</label>
          <input
            aria-label='Account name'
            spellCheck='false'
            value={state.addAccountName}
            onChange={(e) => setState({ addAccountName: e.target.value })}
          />
        </div>
        {needsFramePassword() ? (
          <div className='t2InlineInput'>
            <label>{framePasswordLabel()}</label>
            <input
              aria-label={framePasswordLabel()}
              spellCheck='false'
              type='password'
              value={state.addAccountPassword}
              onChange={(e) => setState({ addAccountPassword: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') createInlineAccount()
              }}
            />
          </div>
        ) : null}
        {state.addAccountError ? <div className='t2InlineAddError'>{state.addAccountError}</div> : null}
        {state.addAccountStatus ? <div className='t2InlineAddStatus'>{state.addAccountStatus}</div> : null}
        <div
          aria-label='Create account'
          className='t2InlineAddSubmit'
          onClick={() => createInlineAccount()}
          onKeyDown={(e) => onKeyboardActivate(e, () => createInlineAccount())}
          role='button'
          tabIndex={0}
        >
          {svg.plus(12)}
          <span className='traySpan'>Create account</span>
        </div>
      </div>
    )
  }

  function renderInlineAddBody() {
    if (state.addAccountCategory === 'createSeed') return renderCreateSeedPhrase()
    if (state.addAccountCategory === 'storedSeed') return renderStoredSeedAdd()
    if (state.addAccountCategory === 'import') return renderImportOptions()
    if (state.addAccountCategory === 'hardware') return renderHardwareOptions()
    if (state.addAccountCategory === 'watch') return renderInlineAddForm()
    return renderInlineAddRoot()
  }

  function renderInlineAddAccount() {
    return (
      <div className='t2InlineAdd'>
        <div className='t2InlineAddHeader'>
          <div
            aria-label='Back'
            className='t2InlineAddBack'
            onClick={() => backInlineAdd()}
            onKeyDown={(e) => onKeyboardActivate(e, () => backInlineAdd())}
            role='button'
            tabIndex={0}
          >
            {svg.chevronLeft(14)}
          </div>
          <div className='t2InlineAddTitle'>Add account</div>
        </div>
        {renderInlineAddBody()}
      </div>
    )
  }

  return renderInlineAddAccount()
}
