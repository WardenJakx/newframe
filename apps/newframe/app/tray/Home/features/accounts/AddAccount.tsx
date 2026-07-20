import { useEffect, useReducer, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Button } from '@newframe/ui/button'
import { Field } from '@newframe/ui/field'
import { Grid } from '@newframe/ui/grid'
import { Icon } from '@newframe/ui/icon'
import { Inline } from '@newframe/ui/inline'
import { Input } from '@newframe/ui/input'
import { ScrollArea } from '@newframe/ui/scroll-area'
import { Spinner } from '@newframe/ui/spinner'
import { Stack } from '@newframe/ui/stack'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'
import { TextArea } from '@newframe/ui/text-area'
import { ToggleButton } from '@newframe/ui/toggle-button'

import link from '../../../../../resources/link'
import svg from '../../../../../resources/svg'
import { createBalanceSummarySelector, formatUsdRate } from '../../../../../resources/domain/balance'
import { SidePanelHeader } from '../../../../../resources/Components/SidePanel/SidePanelHeader'
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
      <Button
        appearance='outlinedSelection'
        key={optionKey}
        label={label}
        onPress={onClick}
        selected={active}
        size='list'
        width='full'
      >
        {renderInlineAddIcon(icon)}
        <Text variant='label'>{label}</Text>
      </Button>
    )
  }

  function renderInlineAddRoot() {
    return (
      <Stack gap='small'>
        {inlineAddSections.map((option) =>
          renderInlineAddOption({
            active: state.addAccountCategory === option.section,
            icon: option.icon,
            label: option.title,
            onClick: () => chooseInlineAddCategory(option.section),
            optionKey: option.section
          })
        )}
      </Stack>
    )
  }

  function renderFeedback() {
    return (
      <>
        {state.addAccountError ? (
          <Text tone='danger' variant='supporting'>
            {state.addAccountError}
          </Text>
        ) : null}
        {state.addAccountStatus ? (
          <Text tone='accent' variant='supporting'>
            {state.addAccountStatus}
          </Text>
        ) : null}
      </>
    )
  }

  function renderAccountRow({
    address,
    imported,
    index,
    label,
    onPress,
    value
  }: {
    address: string
    imported: boolean
    index: number
    label: string
    onPress: () => void
    value: string
  }) {
    return (
      <Button
        appearance='row'
        label={`${imported ? 'Select' : 'Add'} ${label}`}
        onPress={onPress}
        size='list'
        width='full'
      >
        <Text tone='muted' variant='caption' shrink={false}>
          {index + 1}.
        </Text>
        <Stack gap='none' grow>
          <Text variant='label' truncate>
            {label}
          </Text>
          <Text tone='muted' variant='code'>
            {shortAddress(address)}
          </Text>
        </Stack>
        <Stack align='end' gap='none'>
          <Text variant='numeric'>{value}</Text>
          {imported ? (
            <Text tone='accent' variant='micro'>
              Imported
            </Text>
          ) : null}
        </Stack>
        {imported ? <Icon name='check' size='small' tone='accent' /> : null}
      </Button>
    )
  }

  function renderStoredSeedOption(signer: any, seedIndex: number, accounts: Record<string, any>) {
    const wallets = seedWallets(signer, accounts)
    const importedWallets = wallets.filter((wallet: any) => wallet.account)
    const expanded = !!state.storedSeedExpanded?.[signer.id]
    const visibleWallets = expanded ? importedWallets : importedWallets.slice(0, 3)
    const label = seedPhraseLabel(seedIndex)

    return (
      <Surface border='subtle' key={signer.id} padding='small' radius='card' tone='card'>
        <Stack gap='small'>
          <Inline align='center' gap='small' justify='between'>
            <Inline align='center' gap='small'>
              {renderInlineAddIcon('seedling')}
              <Text variant='label'>{label}</Text>
            </Inline>
            <Text tone='secondary' variant='caption'>{`${importedWallets.length}/${wallets.length}`}</Text>
          </Inline>
          {visibleWallets.map((wallet: any) => (
            <Inline align='center' gap='small' justify='between' key={wallet.address}>
              <Text variant='supporting'>{walletDisplayName(wallet)}</Text>
              <Text tone='muted' variant='code'>
                {shortAddress(wallet.address)}
              </Text>
            </Inline>
          ))}
          {importedWallets.length > 3 && !expanded ? (
            <Button appearance='ghost' onPress={() => expandStoredSeed(signer.id)} size='compact'>
              <Text variant='caption'>More wallets</Text>
            </Button>
          ) : null}
          <Button
            appearance='subtle'
            onPress={() => setState({ addAccountSelectedSigner: signer.id })}
            size='small'
            width='full'
          >
            <Icon name='plus' size='small' />
            <Text variant='compactAction'>Add address</Text>
          </Button>
        </Stack>
      </Surface>
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
        <Surface padding='large' radius='card' tone='card'>
          <Stack align='center' gap='small'>
            <Text tone='secondary'>No stored recovery phrases</Text>
            <Button appearance='primary' onPress={() => chooseInlineAddCategory('createSeed')} size='small'>
              <Icon name='plus' size='small' />
              <Text variant='compactAction'>Create recovery phrase</Text>
            </Button>
            <Button
              appearance='control'
              onPress={() => setState({ addAccountCategory: 'import', addAccountType: 'seed' })}
              size='small'
            >
              <Text variant='compactAction'>Import recovery phrase</Text>
            </Button>
          </Stack>
        </Surface>
      )
    }

    if (!selectedSigner) {
      return (
        <Stack gap='small'>
          {signers.map((signer: any, index: number) => renderStoredSeedOption(signer, index, accounts))}
        </Stack>
      )
    }

    return (
      <Stack gap='xsmall'>
        {selectedSigner.addresses.map((address: string, index: number) => {
          const account = accounts[address.toLowerCase()]
          return renderAccountRow({
            address,
            imported: !!account,
            index,
            label: walletDisplayName({ account, index }),
            onPress: () => createStoredSeedAccount(selectedSigner, address),
            value: account ? accountNavValue(account) : '$0.00'
          })
        })}
      </Stack>
    )
  }

  function renderCreateSeedPhrase() {
    const phrase = (state.addGeneratedPhrase || '').trim()
    const words = phrase ? phrase.split(/\s+/) : []

    return (
      <Stack gap='small'>
        <Surface border='danger' padding='small' radius='small' tone='card'>
          <Inline align='center' gap='small'>
            <Icon name='warning' size='small' tone='danger' />
            <Text tone='danger' variant='supporting'>
              Save these words in order. Newframe cannot recover them later.
            </Text>
          </Inline>
        </Surface>
        {words.length ? (
          <Grid columns='three' gap='small'>
            {words.map((word: string, index: number) => (
              <Surface key={`${word}-${index}`} padding='small' radius='small' tone='raised'>
                <Inline align='center' gap='xsmall'>
                  <Text tone='muted' variant='caption'>
                    {index + 1}
                  </Text>
                  <Text as='strong' variant='supporting'>
                    {word}
                  </Text>
                </Inline>
              </Surface>
            ))}
          </Grid>
        ) : (
          <Surface padding='large' radius='card' tone='card'>
            {state.addAccountStatus ? (
              <Spinner label={state.addAccountStatus} />
            ) : (
              <Text align='center'>Preparing recovery phrase</Text>
            )}
          </Surface>
        )}
        <Inline align='center' gap='small'>
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
        </Inline>
        <ToggleButton
          appearance='row'
          label='Recovery phrase saved'
          onPress={() => setState({ addGeneratedPhraseBackedUp: !state.addGeneratedPhraseBackedUp })}
          pressed={state.addGeneratedPhraseBackedUp}
          size='medium'
        >
          {state.addGeneratedPhraseBackedUp ? <Icon name='check' size='small' tone='accent' /> : null}
          <Text variant='supporting'>I saved this recovery phrase</Text>
        </ToggleButton>
        <Field label='Account name' vertical>
          <Input
            label='Account name'
            spellCheck={false}
            value={state.addAccountName}
            onValueChange={(value) => setState({ addAccountName: value })}
          />
        </Field>
        {needsFramePassword() ? (
          <Field label={framePasswordLabel()} vertical>
            <Input
              label={framePasswordLabel()}
              spellCheck={false}
              type='password'
              value={state.addAccountPassword}
              onValueChange={(value) => setState({ addAccountPassword: value })}
              onSubmit={() => void createGeneratedSeedAccount()}
            />
          </Field>
        ) : null}
        {renderFeedback()}
        <Button
          appearance='primary'
          onPress={() => void createGeneratedSeedAccount()}
          size='large'
          width='full'
        >
          <Icon name='plus' size='small' />
          <Text variant='action'>Create account</Text>
        </Button>
      </Stack>
    )
  }

  function renderImportOptions() {
    if (state.addAccountType) return renderInlineAddForm()

    return (
      <Stack gap='small'>
        {inlineImportTypes.map((option) =>
          renderInlineAddOption({
            active: state.addAccountType === option.type,
            icon: option.icon,
            label: option.title,
            onClick: () => chooseInlineAddType(option.type),
            optionKey: option.type
          })
        )}
      </Stack>
    )
  }

  function renderHardwareOptions() {
    if (state.addAccountType) return renderHardwareAdd()

    return (
      <Stack gap='small'>
        {inlineHardwareTypes.map((option) =>
          renderInlineAddOption({
            icon: option.icon,
            label: option.title,
            onClick: () => chooseInlineAddType(option.type),
            optionKey: option.type
          })
        )}
      </Stack>
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
      <Stack gap='small'>
        {signers.length === 0 ? (
          <Surface padding='large' radius='card' tone='card'>
            <Stack align='center' gap='small'>
              <Text>{`Unlock your ${title} to get started`}</Text>
              {type === 'lattice' ? null : (
                <Text tone='secondary' variant='supporting'>{`${title} will appear here when detected`}</Text>
              )}
            </Stack>
          </Surface>
        ) : (
          <Stack gap='xsmall'>
            {signers.map((signer: any) => {
              const addressCount = Array.isArray(signer.addresses) ? signer.addresses.length : 0
              return (
                <Button
                  appearance='row'
                  key={signer.id}
                  label={`View ${signer.name || title} accounts`}
                  onPress={() => selectHardwareSigner(signer.id)}
                  size='list'
                  width='full'
                >
                  {renderInlineAddIcon(
                    type === 'ledger' ? 'ledger' : type === 'trezor' ? 'trezor' : 'lattice',
                    14
                  )}
                  <Stack gap='none' grow>
                    <Text variant='label'>{signer.name || title}</Text>
                    <Text tone='secondary' variant='caption'>
                      {signer.status || 'Detected'}
                    </Text>
                  </Stack>
                  <Text tone='accent' variant='caption'>{`${addressCount} accounts`}</Text>
                  <Icon name='arrowRight' size='small' tone='muted' />
                </Button>
              )
            })}
          </Stack>
        )}
        {type === 'lattice' ? renderLatticeAdd() : null}
      </Stack>
    )
  }

  function renderLatticeAdd() {
    return (
      <Stack gap='small'>
        <Field label='Device name' vertical>
          <Input
            label='Lattice device name'
            spellCheck={false}
            value={state.addAccountName}
            onValueChange={(value) =>
              setState({ addAccountName: value.replace(/\s+/g, '-').substring(0, 14) })
            }
          />
        </Field>
        <Field label='Device ID' vertical>
          <Input
            label='Lattice device ID'
            spellCheck={false}
            value={state.addAccountInput}
            onValueChange={(value) => setState({ addAccountInput: value })}
            onSubmit={() => void createLatticeSigner()}
          />
        </Field>
        {renderFeedback()}
        <Button appearance='primary' onPress={() => void createLatticeSigner()} size='large' width='full'>
          <Icon name='plus' size='small' />
          <Text variant='action'>Create signer</Text>
        </Button>
      </Stack>
    )
  }

  function renderHardwareSignerDetails(signer: any, title: string) {
    const addresses = Array.isArray(signer.addresses) ? signer.addresses : []
    const status = (signer.status || '').toLowerCase()
    const loading = ['loading', 'connecting', 'addresses', 'input', 'pairing', 'deriving'].some((part) =>
      status.includes(part)
    )

    return (
      <Stack gap='small'>
        <Surface border='subtle' padding='small' radius='card' tone='card'>
          <Inline align='center' gap='small'>
            {renderInlineAddIcon(signer.type, 16)}
            <Stack gap='none' grow>
              <Text variant='label'>{signer.name || title}</Text>
              <Text tone='secondary' variant='caption'>
                {signer.status || 'Detected'}
              </Text>
            </Stack>
            {loading ? <Spinner label='Connecting hardware wallet' /> : null}
          </Inline>
        </Surface>
        {renderHardwareSignerAction(signer, status)}
        {addresses.length ? (
          <Stack gap='xsmall'>
            {addresses.map((address: string, index: number) => {
              const id = address.toLowerCase()
              const accounts = props.shared.accounts
              const imported = !!accounts[id]
              return renderAccountRow({
                address,
                imported,
                index,
                label: shortAddress(address),
                onPress: () => addHardwareAccount(signer, address),
                value: imported ? accountNavValue(accounts[id]) : '$0.00'
              })
            })}
          </Stack>
        ) : (
          <Surface padding='large' radius='card' tone='card'>
            <Text align='center' tone='secondary'>
              {loading ? 'Loading accounts' : 'No accounts loaded yet'}
            </Text>
          </Surface>
        )}
        {renderFeedback()}
        <Inline align='center' gap='small'>
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
        </Inline>
      </Stack>
    )
  }

  function renderHardwareSignerAction(signer: any, status: string) {
    if (signer.type === 'trezor' && status === 'need pin') {
      return (
        <Surface padding='medium' radius='card' tone='card'>
          <Stack gap='small'>
            <Text align='center' variant='code'>
              {'•'.repeat(state.addHardwarePin.length) || 'Enter PIN positions'}
            </Text>
            <Grid columns='three' gap='small'>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <Button
                  appearance='control'
                  key={num}
                  label={`PIN position ${num}`}
                  onPress={() => addHardwarePinDigit(num)}
                  size='medium'
                >
                  <Text variant='numeric'>{num}</Text>
                </Button>
              ))}
            </Grid>
            <Inline align='center' gap='small'>
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
            </Inline>
          </Stack>
        </Surface>
      )
    }

    if (signer.type === 'trezor' && status === 'enter passphrase') {
      const allowsDeviceEntry = (signer.capabilities || []).includes('Capability_PassphraseEntry')

      return (
        <Surface padding='medium' radius='card' tone='card'>
          <Stack gap='small'>
            <Field label='Passphrase' vertical>
              <Input
                label='Trezor passphrase'
                spellCheck={false}
                type='password'
                value={state.addHardwarePhrase}
                onValueChange={(value) => setState({ addHardwarePhrase: value })}
                onSubmit={() => submitHardwarePhrase(signer)}
              />
            </Field>
            <Inline align='center' gap='small'>
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
            </Inline>
          </Stack>
        </Surface>
      )
    }

    if (signer.type === 'lattice' && status === 'pair') {
      return (
        <Surface padding='medium' radius='card' tone='card'>
          <Stack gap='small'>
            <Field label='Pairing code' vertical>
              <Input
                label='GridPlus pairing code'
                spellCheck={false}
                value={state.addHardwarePairCode}
                onValueChange={(value) => setState({ addHardwarePairCode: value.toUpperCase() })}
                onSubmit={() => void pairHardwareLattice(signer)}
              />
            </Field>
            <Button
              appearance='primary'
              onPress={() => void pairHardwareLattice(signer)}
              size='large'
              width='full'
            >
              <Icon name='check' size='small' />
              <Text variant='action'>Pair</Text>
            </Button>
          </Stack>
        </Surface>
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
      <Stack gap='small'>
        {showAccountInput ? (
          <Field label={inputLabel} vertical>
            {state.addAccountType === 'seed' ? (
              <TextArea
                label={inputLabel}
                spellCheck={false}
                value={state.addAccountInput}
                onValueChange={(value) => setState({ addAccountInput: value })}
              />
            ) : (
              <Input
                label={inputLabel}
                spellCheck={false}
                value={state.addAccountInput}
                onValueChange={(value) => setState({ addAccountInput: value })}
                onSubmit={() => void createInlineAccount()}
              />
            )}
          </Field>
        ) : (
          <Button
            appearance='outlinedSelection'
            label='Choose JSON backup file'
            onPress={() => void locateInlineKeystore()}
            selected={!!state.addAccountKeystore}
            size='list'
            width='full'
          >
            {svg.file(14)}
            <Text variant='label'>
              {state.addAccountKeystore ? 'JSON backup file selected' : 'Choose JSON backup file'}
            </Text>
          </Button>
        )}
        {state.addAccountType === 'keystore' ? (
          <Field label='JSON backup file password' vertical>
            <Input
              label='JSON backup file password'
              spellCheck={false}
              type='password'
              value={state.addAccountKeystorePassword}
              onValueChange={(value) => setState({ addAccountKeystorePassword: value })}
            />
          </Field>
        ) : null}
        <Field label='Account name' vertical>
          <Input
            label='Account name'
            spellCheck={false}
            value={state.addAccountName}
            onValueChange={(value) => setState({ addAccountName: value })}
          />
        </Field>
        {needsFramePassword() ? (
          <Field label={framePasswordLabel()} vertical>
            <Input
              label={framePasswordLabel()}
              spellCheck={false}
              type='password'
              value={state.addAccountPassword}
              onValueChange={(value) => setState({ addAccountPassword: value })}
              onSubmit={() => void createInlineAccount()}
            />
          </Field>
        ) : null}
        {renderFeedback()}
        <Button appearance='primary' onPress={() => void createInlineAccount()} size='large' width='full'>
          <Icon name='plus' size='small' />
          <Text variant='action'>Create account</Text>
        </Button>
      </Stack>
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
      <Stack grow gap='none'>
        <SidePanelHeader closeLabel='Back' onClose={backInlineAdd} title='Add account' />
        <ScrollArea height='page'>
          <Surface padding='medium' radius='none' tone='transparent'>
            {renderInlineAddBody()}
          </Surface>
        </ScrollArea>
      </Stack>
    )
  }

  return renderInlineAddAccount()
}
