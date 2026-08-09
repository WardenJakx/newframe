import { useEffect, useReducer, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Button } from '@newframe/ui/button'
import { Field } from '@newframe/ui/field'
import { Grid } from '@newframe/ui/grid'
import { Icon, type IconName } from '@newframe/ui/icon'
import { Inline } from '@newframe/ui/inline'
import { Input } from '@newframe/ui/input'
import { ScrollArea } from '@newframe/ui/scroll-area'
import { Spinner } from '@newframe/ui/spinner'
import { Stack } from '@newframe/ui/stack'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'
import { TextArea } from '@newframe/ui/text-area'
import { ToggleButton } from '@newframe/ui/toggle-button'

import link from '../../../platform/ipc/renderer/link'
import { AppIcon } from '../../../shared/renderer/ui/appIcon'
import { signerIconName, signerIsLoading, signerTypeLabel } from '../../../shared/renderer/ui/signerPresentation'
import { createBalanceSummarySelector, formatUsdRate } from '../../asset-data/domain/balance'
import { SidePanelHeader } from '../../../shared/renderer/ui/SidePanel/SidePanelHeader'
import { useWalletSelector } from '../../../platform/state-sync/renderer/useAppSelector'
import { ChainIcon } from '../../../app/renderer/tray/Home/components/ChainIcon'
import {
  addAccountCategoryForType,
  emptyAddAccountDraft,
  hardwarePageModel,
  normalizeAddAccountType,
  onboardingStatusText
} from './addAccountModel'

type InlineIconName = IconName | 'file'
type AddOption = { id: string; title: string; icon: InlineIconName }
const addOptions: Record<'root' | 'import' | 'hardware', AddOption[]> = {
  root: [
    { id: 'createSeed', title: 'Create recovery phrase', icon: 'flame' },
    { id: 'storedSeed', title: 'Add from stored recovery phrases', icon: 'flame' },
    { id: 'import', title: 'Import phrase or private key', icon: 'accounts' },
    { id: 'hardware', title: 'Connect a hardware wallet', icon: 'device' },
    { id: 'watch', title: 'Watch an address', icon: 'eye' }
  ],
  import: [
    { id: 'seed', title: 'Recovery phrase', icon: 'flame' },
    { id: 'privateKey', title: 'Private key', icon: 'wallet' },
    { id: 'keystore', title: 'JSON backup file', icon: 'file' }
  ],
  hardware: [
    { id: 'trezor', title: 'Trezor', icon: 'trezor' },
    { id: 'ledger', title: 'Ledger', icon: 'ledger' },
    { id: 'lattice', title: 'GridPlus', icon: 'lattice' }
  ]
}

const EMPTY_RECORD: Record<string, any> = {}
type AppCommand = Parameters<typeof link.executeCommand>[0]

type AddAccountState = Omit<typeof emptyAddAccountDraft, 'addAccountKeystore'> & {
  addAccountCategory: string
  addAccountKeystore: any
  addAccountType: string
  addVaultState: { exists: boolean; unlocked: boolean } | null
  storedSeedExpanded: Record<string, boolean>
}

function addAccountReducer(state: AddAccountState, update: Partial<AddAccountState>) {
  return { ...state, ...update }
}

function operationError(result: any, fallback: string) {
  return result && 'message' in result && typeof result.message === 'string' ? result.message : fallback
}

type HardwareSession = { operationId: string; signerId: string }
type Submission = { operationId: string; type: string }

function useSubmission(setState: (update: any, callback?: () => void) => void) {
  const [submission, setSubmission] = useState<Submission | null>(null)
  const submissionRef = useRef(submission)
  const setActive = (next: Submission | null) => {
    submissionRef.current = next
    setSubmission(next)
  }
  const fail = (operationId: string, error: any, fallback: string) => {
    if (submissionRef.current?.operationId !== operationId) return false
    setActive(null)
    setState({ addAccountError: operationError(error, fallback), addAccountStatus: '' })
    return true
  }
  const run = async (
    type: string,
    command: (operationId: string) => AppCommand,
    fallback: string,
    clearFeedback = true
  ) => {
    const operationId = crypto.randomUUID()
    setActive({ operationId, type })
    if (clearFeedback) setState({ addAccountError: '', addAccountStatus: '' })
    try {
      const result = await link.executeCommand(command(operationId))
      if (!result.ok) fail(operationId, result, fallback)
    } catch (error) {
      fail(operationId, error, fallback)
    }
  }
  return { fail, run, setActive, submission, submissionRef }
}

function useHardwareSession(onBegin: (submission: Submission) => void) {
  const [session, setSession] = useState<HardwareSession | null>(null)
  const sessionRef = useRef(session)
  const setActive = (next: HardwareSession | null) => {
    sessionRef.current = next
    setSession(next)
  }
  const finish = (outcome: 'ready' | 'cancelled') => {
    const current = sessionRef.current
    if (!current) return
    setActive(null)
    void link.executeCommand({
      type: 'signer.hardware-session-finish',
      operationId: current.operationId,
      signerId: current.signerId,
      outcome
    })
  }
  const begin = (signerId: string, reload: boolean) => {
    if (sessionRef.current?.signerId !== signerId) finish('cancelled')
    const operationId = crypto.randomUUID()
    setActive({ operationId, signerId })
    onBegin({ operationId, type: reload ? 'signer.reload' : 'signer.hardware-session-start' })
    void link.executeCommand(
      reload
        ? { type: 'signer.reload', operationId, signerId }
        : { type: 'signer.hardware-session-start', operationId, signerId }
    )
  }
  return { begin, finish, session, sessionRef, setActive }
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
      currentAccount: state.currentAccount || '',
      balances: state.balances || EMPTY_RECORD,
      ledger: state.ledger,
      networks: state.networks?.ethereum || EMPTY_RECORD,
      networksMeta: state.networksMeta?.ethereum || EMPTY_RECORD,
      operations: state.operations || EMPTY_RECORD,
      assetRates: state.assetRates || EMPTY_RECORD,
      tokens: state.tokens,
      showLocalNameWithENS: !!state.showLocalNameWithENS,
      showTestnets: !!state.showTestnets,
      signers: state.signers || EMPTY_RECORD
    }))
  )
  const props = { shared }
  const seedPhraseCopiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const initialHardwareSessionStarted = useRef(false)
  const [selectBalanceSummaries] = useState(() => createBalanceSummarySelector())
  const initialAddAccountType = normalizeAddAccountType(initialType)
  const [state, dispatch] = useReducer(addAccountReducer, {
    ...emptyAddAccountDraft,
    addAccountCategory: addAccountCategoryForType(initialAddAccountType),
    addAccountType: initialAddAccountType,
    addAccountName: initialAddAccountType === 'lattice' ? 'GridPlus' : '',
    addAccountSelectedSigner: initialSelectedSigner,
    storedSeedExpanded: {},
    addVaultState: null
  })
  const [hardwarePage, setHardwarePage] = useState(1)
  const [hardwarePageInput, setHardwarePageInput] = useState('1')
  const [addressChainUsageResult, setAddressChainUsageResult] = useState<{
    key: string
    usage: Record<string, { chainIds: number[]; complete: boolean }>
  }>({ key: '', usage: {} })
  const addressChainUsageRequest = useRef(0)
  const [pendingExistingAccount, setPendingExistingAccount] = useState('')
  const setState = (update: any, callback?: () => void) => {
    const next = typeof update === 'function' ? update(state, props) : update
    if (next.addingAccount === false) onClose()
    const local = { ...next }
    ;['accountsOpen', 'addingAccount', 'menuOpen', 'overlay'].forEach((key) => delete local[key])
    if (Object.keys(local).length) dispatch(local as Partial<AddAccountState>)
    callback?.()
  }
  const {
    fail: failSubmission,
    run: runSubmission,
    setActive: setActiveSubmission,
    submission,
    submissionRef
  } = useSubmission(setState)
  const {
    begin: beginHardwareSession,
    finish: finishHardwareSession,
    session: hardwareSession,
    sessionRef: hardwareSessionRef,
    setActive: setActiveHardwareSession
  } = useHardwareSession(setActiveSubmission)
  const whenCurrent = (
    ref: typeof submissionRef | typeof hardwareSessionRef,
    operationId: string,
    action: () => void
  ) => queueMicrotask(() => ref.current?.operationId === operationId && action())
  const selectedHardwareSigner = state.addAccountSelectedSigner
    ? shared.signers[state.addAccountSelectedSigner]
    : null
  const selectedHardwarePage = hardwarePageModel(
    selectedHardwareSigner,
    hardwarePage,
    shared.ledger?.derivation === 'live'
  )
  const visibleHardwareAddresses = selectedHardwarePage.addresses
  const visibleHardwareAddressKey = visibleHardwareAddresses
    .map((address: string) => address.toLowerCase())
    .join(',')
  const enabledChainKey = Object.values(shared.networks)
    .filter((chain: any) => chain.on)
    .map((chain: any) => chain.id)
    .sort((a: number, b: number) => a - b)
    .join(',')
  const addressChainUsageKey = [
    selectedHardwareSigner?.id || '',
    enabledChainKey,
    visibleHardwareAddressKey
  ].join(':')
  const addressChainUsage =
    addressChainUsageResult.key === addressChainUsageKey ? addressChainUsageResult.usage : {}
  const addressChainUsageLoading =
    visibleHardwareAddresses.length > 0 && addressChainUsageResult.key !== addressChainUsageKey
  const onboardingOperation = submission ? shared.operations[submission.operationId] : undefined
  const operationStatus = onboardingOperation?.status === 'pending' ? onboardingOperation.phase || '' : ''
  const displayedStatus = onboardingStatusText(operationStatus, state.addAccountStatus)

  useEffect(() => {
    const isHardwareSigner = ['ledger', 'trezor', 'lattice'].includes(selectedHardwareSigner?.type || '')
    const addresses = visibleHardwareAddresses

    if (!isHardwareSigner || !addresses.length) return

    const requestId = ++addressChainUsageRequest.current

    void link
      .executeQuery({ type: 'address.chain-usage', addresses })
      .then((result) => {
        if (requestId !== addressChainUsageRequest.current) return

        setAddressChainUsageResult({
          key: addressChainUsageKey,
          usage: result.ok
            ? Object.fromEntries(
                result.usage.map((entry) => [
                  entry.address.toLowerCase(),
                  { chainIds: entry.chainIds, complete: entry.complete }
                ])
              )
            : {}
        })
      })
      .catch(() => {
        if (requestId === addressChainUsageRequest.current) {
          setAddressChainUsageResult({ key: addressChainUsageKey, usage: {} })
        }
      })

    return () => {
      if (addressChainUsageRequest.current === requestId) addressChainUsageRequest.current += 1
    }
  }, [
    addressChainUsageKey,
    selectedHardwareSigner?.id,
    selectedHardwareSigner?.type,
    visibleHardwareAddresses
  ])

  function resetInlineAdd() {
    finishHardwareSession('cancelled')
    setState({
      ...emptyAddAccountDraft,
      addingAccount: false,
      addAccountCategory: '',
      addAccountType: '',
      addVaultState: null
    })
  }

  useEffect(() => {
    let active = true

    async function refreshAddVaultState() {
      try {
        const status = await link.executeQuery({ type: 'security.status' })
        if (!active) return

        dispatch({
          addVaultState: status.ok
            ? { exists: status.vaultExists, unlocked: !status.locked }
            : { exists: false, unlocked: false }
        })
      } catch {
        if (active) dispatch({ addVaultState: { exists: false, unlocked: false } })
      }
    }

    void refreshAddVaultState()
    return () => {
      active = false
      clearTimeout(seedPhraseCopiedTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    if (!pendingExistingAccount || shared.currentAccount.toLowerCase() !== pendingExistingAccount) return
    onClose()
  }, [onClose, pendingExistingAccount, shared.currentAccount])

  useEffect(() => {
    if (!submission || !onboardingOperation) return
    const operationId = submission.operationId
    if (onboardingOperation.status === 'failed') {
      whenCurrent(submissionRef, operationId, () =>
        failSubmission(operationId, onboardingOperation.error, 'Could not complete the account operation.')
      )
      return
    }

    const signerId = onboardingOperation.entityRefs?.find((ref: any) => ref.type === 'signer')?.id
    if (submission.type === 'signer.lattice-create' && signerId && hardwareSession?.signerId !== signerId) {
      whenCurrent(submissionRef, operationId, () => {
        dispatch({
          addAccountSelectedSigner: signerId,
          addAccountInput: '',
          addAccountName: 'GridPlus',
          addAccountError: ''
        })
        setActiveHardwareSession({ operationId, signerId })
      })
    }

    if (onboardingOperation.status !== 'succeeded') return
    if (['account.add-from-signer', 'account.watch-add', 'signer.import'].includes(submission.type)) {
      whenCurrent(submissionRef, operationId, resetInlineAdd)
    } else if (submission.type === 'signer.lattice-pair') {
      whenCurrent(submissionRef, operationId, () => {
        dispatch({ addHardwarePairCode: '', addAccountError: '', addAccountStatus: 'GridPlus paired' })
        setActiveSubmission(null)
      })
    } else {
      whenCurrent(submissionRef, operationId, () => setActiveSubmission(null))
    }
    // resetInlineAdd intentionally reads the latest local draft through the render closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hardwareSession?.signerId, onboardingOperation, submission])

  useEffect(() => {
    if (!hardwareSession) return
    const signer = shared.signers[hardwareSession.signerId]
    const session = shared.operations[hardwareSession.operationId]
    const operationId = hardwareSession.operationId
    if (session?.status === 'failed') {
      whenCurrent(hardwareSessionRef, operationId, () => {
        dispatch({
          addAccountError: session.error?.message || 'Could not complete the hardware operation.',
          addAccountStatus: ''
        })
        setActiveHardwareSession(null)
      })
      return
    }
    if (signer?.status?.toLowerCase() !== 'ok') return

    whenCurrent(hardwareSessionRef, operationId, () => finishHardwareSession('ready'))
    // finishHardwareSession is intentionally guarded by the mutable active-session reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hardwareSession, shared.operations, shared.signers])

  useEffect(() => {
    if (!initialSelectedSigner || initialHardwareSessionStarted.current) return
    initialHardwareSessionStarted.current = true
    queueMicrotask(() => beginHardwareSession(initialSelectedSigner, false))
    // This mount-only bootstrap is keyed solely by the requested initial signer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSelectedSigner])

  async function selectExistingAccount(id: string) {
    if (pendingExistingAccount) return
    setPendingExistingAccount(id)
    setState({ addAccountError: '', addAccountStatus: 'Selecting account' })

    try {
      const result = await link.executeCommand({ type: 'account.select', accountId: id })
      if (result.ok) return

      setPendingExistingAccount('')
      setState({
        addAccountError: operationError(result, 'Could not select account'),
        addAccountStatus: ''
      })
    } catch {
      setPendingExistingAccount('')
      setState({ addAccountError: 'Could not select account', addAccountStatus: '' })
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
    const balances = selectBalanceSummaries({
      rawBalances,
      assetRates: shared.assetRates,
      tokens: shared.tokens,
      networks: shared.networks,
      networksMeta: shared.networksMeta,
      includeChain: (chain) => (!chain.isTestnet || shared.showTestnets) && !!chain.on,
      cacheKey: account.address
    })
    if (balances.length > 0 && !balances.some((balance) => balance.hasPrice)) return '—'
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

  function backInlineAdd() {
    if (state.addAccountSelectedSigner) {
      finishHardwareSession('cancelled')
      return setState({ addAccountSelectedSigner: '', addAccountError: '', addAccountStatus: '' })
    }

    if (state.addAccountCategory) {
      return setState({
        ...emptyAddAccountDraft,
        addAccountCategory: '',
        addAccountType: ''
      })
    }

    resetInlineAdd()
  }

  function chooseInlineAddCategory(category: string) {
    const addAccountType = category === 'watch' ? 'watch' : category === 'createSeed' ? 'seed' : ''

    setState(
      {
        ...emptyAddAccountDraft,
        addAccountCategory: category,
        addAccountType
      },
      () => {
        if (category === 'createSeed') generateInlineSeedPhrase()
      }
    )
  }

  function chooseInlineAddType(type: string) {
    setState({
      ...emptyAddAccountDraft,
      addAccountType: type
    })
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

  async function addSignerAddress(signer: any, address: string, name: string, fallback: string) {
    if (!signer?.id || !address) return
    const accounts = props.shared.accounts
    const id = address.toLowerCase()

    if (accounts[id]) {
      if (shared.currentAccount.toLowerCase() === id) return resetInlineAdd()
      void selectExistingAccount(id)
      return
    }

    await runSubmission(
      'account.add-from-signer',
      (operationId) => ({ type: 'account.add-from-signer', operationId, signerId: signer.id, address, name }),
      fallback
    )
  }

  async function locateInlineKeystore() {
    setState({ addAccountError: '', addAccountStatus: 'Selecting JSON backup file' })

    const result = await link.executeQuery({ type: 'keystore.locate' })
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
    setHardwarePage(1)
    setHardwarePageInput('1')
    setState({
      addAccountSelectedSigner: signerId,
      addAccountError: '',
      addAccountStatus: '',
      addHardwarePin: '',
      addHardwarePhrase: '',
      addHardwarePairCode: ''
    })
    beginHardwareSession(signerId, false)
  }

  async function createLatticeSigner() {
    const deviceId = (state.addAccountInput || '').trim()
    const deviceName = (state.addAccountName || '').trim() || 'GridPlus'

    if (!deviceId) return setState({ addAccountError: 'Device ID required' })

    await runSubmission(
      'signer.lattice-create',
      (operationId) => ({ type: 'signer.lattice-create', operationId, deviceId, deviceName }),
      'Could not create the GridPlus signer.'
    )
  }

  function hardwareAccountName(signer: any) {
    const label = signerTypeLabel(signer?.type, 'Hardware')
    return `${label} Account`
  }

  function reloadHardwareSigner(signer: any) {
    if (!signer?.id) return
    beginHardwareSession(signer.id, true)
    setState({ addAccountError: '', addAccountStatus: '' })
  }

  function removeHardwareSigner(signer: any) {
    if (!signer?.id) return
    const operationId = crypto.randomUUID()
    setActiveSubmission({ operationId, type: 'signer.disconnect' })
    void link.executeCommand({ type: 'signer.disconnect', operationId, signerId: signer.id })
    setState({ addAccountSelectedSigner: '', addAccountError: '', addAccountStatus: '' })
  }

  function addHardwarePinDigit(num: number) {
    setState({ addHardwarePin: `${state.addHardwarePin || ''}${num}` })
  }

  function backspaceHardwarePin() {
    setState({ addHardwarePin: (state.addHardwarePin || '').slice(0, -1) })
  }

  function submitTrezorInput(signer: any, input: 'pin' | 'passphrase' | 'device-passphrase') {
    if (!signer?.id) return
    if (input === 'pin' && !state.addHardwarePin) return setState({ addAccountError: 'PIN required' })
    if (!hardwareSession || hardwareSession.signerId !== signer.id) {
      return setState({ addAccountError: 'Reconnect the hardware wallet first' })
    }
    const actionId = crypto.randomUUID()
    setActiveSubmission({ operationId: actionId, type: 'signer.trezor-input' })
    const value = input === 'pin' ? state.addHardwarePin : state.addHardwarePhrase
    const command =
      input === 'device-passphrase'
        ? {
            type: 'signer.trezor-input' as const,
            operationId: hardwareSession.operationId,
            actionId,
            signerId: signer.id,
            input
          }
        : {
            type: 'signer.trezor-input' as const,
            operationId: hardwareSession.operationId,
            actionId,
            signerId: signer.id,
            input,
            value
          }
    void link.executeCommand(command)
    setState({
      ...(input === 'pin' ? { addHardwarePin: '' } : input === 'passphrase' ? { addHardwarePhrase: '' } : {}),
      addAccountError: '',
      addAccountStatus:
        input === 'pin'
          ? 'PIN submitted'
          : input === 'passphrase'
            ? 'Passphrase submitted'
            : 'Continue on device'
    })
  }

  async function pairHardwareLattice(signer: any) {
    if (!signer?.id) return
    if (!state.addHardwarePairCode) return setState({ addAccountError: 'Pairing code required' })
    if (!hardwareSession || hardwareSession.signerId !== signer.id) {
      return setState({ addAccountError: 'Reconnect the hardware wallet first' })
    }
    const actionId = crypto.randomUUID()
    setActiveSubmission({ operationId: actionId, type: 'signer.lattice-pair' })

    const result = await link.executeCommand({
      type: 'signer.lattice-pair',
      operationId: hardwareSession.operationId,
      actionId,
      signerId: signer.id,
      pairCode: state.addHardwarePairCode
    })
    if (!result.ok) failSubmission(actionId, result, 'Could not pair GridPlus.')
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

    const operationId = crypto.randomUUID()
    const operationType = addAccountType === 'watch' ? 'account.watch-add' : 'signer.import'
    setActiveSubmission({ operationId, type: operationType })
    setState({ addAccountError: '', addAccountStatus: '' })

    try {
      const result =
        addAccountType === 'watch'
          ? await link.executeCommand({
              type: 'account.watch-add',
              operationId,
              addressOrName: input,
              name: name || 'Watch Account'
            })
          : addAccountType === 'keystore'
            ? addAccountKeystore && addAccountKeystorePassword
              ? await link.executeCommand({
                  type: 'signer.import',
                  operationId,
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
                      operationId,
                      source: 'phrase',
                      phrase: input,
                      framePassword: addAccountPassword,
                      accountName: name || 'Hot Account'
                    }
                  : {
                      type: 'signer.import',
                      operationId,
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
        return void failSubmission(operationId, { message }, message)
      }
      if (!result.ok) throw new Error(operationError(result, 'Could not add the account.'))
    } catch (err: any) {
      failSubmission(operationId, err, 'Could not add the account.')
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

    clearTimeout(seedPhraseCopiedTimeoutRef.current)
    void link.executeCommand({ type: 'clipboard.write', text: phrase })
    setState({ addGeneratedPhraseCopied: true })
    seedPhraseCopiedTimeoutRef.current = setTimeout(() => setState({ addGeneratedPhraseCopied: false }), 1800)
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

    await runSubmission(
      'signer.import',
      (operationId) => ({
        type: 'signer.import',
        operationId,
        source: 'phrase',
        phrase,
        framePassword: password,
        accountName: name || 'Hot Account'
      }),
      'Could not create the account.'
    )
  }

  function renderInlineAddIcon(icon: InlineIconName) {
    if (icon === 'file') return <AppIcon name='file' size={16} />
    return <Icon name={icon} size='medium' />
  }

  function renderOptions(options: AddOption[], selected: string, select: (id: string) => void) {
    return (
      <Stack gap='small'>
        {options.map((option) => (
          <Button
            appearance='outlinedSelection'
            key={option.id}
            label={option.title}
            onPress={() => select(option.id)}
            selected={selected === option.id}
            size='list'
            width='full'
          >
            {renderInlineAddIcon(option.icon)}
            <Text variant='label'>{option.title}</Text>
          </Button>
        ))}
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
        {displayedStatus ? (
          <Text tone='accent' variant='supporting'>
            {displayedStatus}
          </Text>
        ) : null}
      </>
    )
  }

  function renderAccountRow({
    address,
    chainUsage,
    imported,
    index,
    label,
    onPress,
    usageLoading = false,
    value
  }: {
    address: string
    chainUsage?: { chainIds: number[]; complete: boolean }
    imported: boolean
    index: number
    label: string
    onPress: () => void
    usageLoading?: boolean
    value?: string
  }) {
    const usageKnown = chainUsage !== undefined
    const chainIds = chainUsage?.chainIds || []

    return (
      <Button
        appearance='row'
        key={address}
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
          {usageLoading ? (
            <Text tone='muted' variant='caption'>
              Checking chains
            </Text>
          ) : usageKnown && chainIds.length ? (
            <>
              <Text tone='secondary' variant='micro'>
                Used on
              </Text>
              <Inline align='center' gap='xsmall' justify='end' wrap>
                {chainIds.map((chainId) => {
                  const chainName = shared.networks[chainId]?.name || `Chain ${chainId}`
                  return (
                    <span aria-label={chainName} key={chainId} title={chainName}>
                      <ChainIcon
                        chainId={chainId}
                        networks={shared.networks}
                        networksMeta={shared.networksMeta}
                        size='small'
                      />
                    </span>
                  )
                })}
              </Inline>
            </>
          ) : usageKnown && chainUsage.complete ? (
            <Text tone='muted' variant='caption'>
              Unused
            </Text>
          ) : value ? (
            <Text variant='numeric'>{value}</Text>
          ) : (
            <Text tone='muted' variant='caption'>
              Usage unavailable
            </Text>
          )}
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
              {renderInlineAddIcon('flame')}
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
            onPress: () =>
              addSignerAddress(selectedSigner, address, 'Hot Account', 'Could not add the account.'),
            value: account ? accountNavValue(account) : '$0.00'
          })
        })}
        {renderFeedback()}
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
            {displayedStatus ? (
              <Spinner label={displayedStatus} />
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
                  {renderInlineAddIcon(signerIconName(type))}
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
    const status = (signer.status || '').toLowerCase()
    const loading = signerIsLoading(status)

    return (
      <Stack gap='small'>
        <Surface border='subtle' padding='small' radius='card' tone='card'>
          <Inline align='center' gap='small'>
            {renderInlineAddIcon(signerIconName(signer.type))}
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
        {selectedHardwarePage.addresses.length ? (
          <Stack gap='xsmall'>
            {selectedHardwarePage.addresses.map((address: string, index: number) => {
              const id = address.toLowerCase()
              const accounts = props.shared.accounts
              const imported = !!accounts[id]
              return renderAccountRow({
                address,
                chainUsage: addressChainUsage[id],
                imported,
                index: selectedHardwarePage.start + index,
                label: shortAddress(address),
                onPress: () =>
                  addSignerAddress(
                    signer,
                    address,
                    hardwareAccountName(signer),
                    'Could not add the hardware account.'
                  ),
                usageLoading: addressChainUsageLoading
              })
            })}
          </Stack>
        ) : (
          <Surface padding='large' radius='card' tone='card'>
            <Text align='center' tone='secondary'>
              {loading || selectedHardwarePage.missingAddresses
                ? `Loading page ${hardwarePage}`
                : 'No accounts loaded for this page'}
            </Text>
          </Surface>
        )}
        {renderHardwarePagination(signer)}
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

  async function goToHardwarePage(signer: any, requestedPage: number) {
    const pageModel = hardwarePageModel(signer, requestedPage, shared.ledger?.derivation === 'live')
    const { page, requiredAddressCount } = pageModel

    setHardwarePage(page)
    setHardwarePageInput(String(page))

    if (!pageModel.loading) return

    await runSubmission(
      'signer.ledger-accounts-load',
      (operationId) => ({
        type: 'signer.ledger-accounts-load',
        operationId,
        signerId: signer.id,
        accountCount: requiredAddressCount
      }),
      'Could not load that Ledger account page.',
      false
    )
  }

  function renderHardwarePagination(signer: any) {
    const { maxPage } = selectedHardwarePage
    if (maxPage <= 1) return null

    const jumpToInputPage = () => void goToHardwarePage(signer, Number(hardwarePageInput))
    const buttons = [
      { label: 'First', page: 1, disabled: hardwarePage === 1 },
      { label: 'Previous', page: hardwarePage - 1, disabled: hardwarePage === 1 },
      { label: 'Next', page: hardwarePage + 1, disabled: hardwarePage === maxPage },
      { label: 'Last', page: maxPage, disabled: hardwarePage === maxPage }
    ]

    return (
      <Stack gap='xsmall'>
        <Inline align='center' gap='xsmall' justify='between'>
          {buttons.slice(0, 2).map((button) => (
            <Button
              appearance='control'
              disabled={button.disabled}
              key={button.label}
              label={`${button.label} account page`}
              onPress={() => void goToHardwarePage(signer, button.page)}
              size='compact'
            >
              <Text variant='compactAction'>{button.label}</Text>
            </Button>
          ))}
          <Text tone='secondary' variant='caption'>
            {`Page ${hardwarePage} of ${maxPage}`}
          </Text>
          {buttons.slice(2).map((button) => (
            <Button
              appearance='control'
              disabled={button.disabled}
              key={button.label}
              label={`${button.label} account page`}
              onPress={() => void goToHardwarePage(signer, button.page)}
              size='compact'
            >
              <Text variant='compactAction'>{button.label}</Text>
            </Button>
          ))}
        </Inline>
        <Inline align='center' gap='xsmall'>
          <Text tone='muted' variant='caption' shrink={false}>
            Go to page
          </Text>
          <Input
            align='end'
            appearance='numeric'
            inputMode='numeric'
            label='Account page number'
            max={maxPage}
            min={1}
            onSubmit={jumpToInputPage}
            onValueChange={setHardwarePageInput}
            type='number'
            value={hardwarePageInput}
          />
          <Button appearance='control' onPress={jumpToInputPage} size='small'>
            <Text variant='compactAction'>Go</Text>
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
                onPress={() => submitTrezorInput(signer, 'pin')}
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
                onSubmit={() => submitTrezorInput(signer, 'passphrase')}
              />
            </Field>
            <Inline align='center' gap='small'>
              <Button
                appearance='control'
                label='Submit Trezor passphrase'
                onPress={() => submitTrezorInput(signer, 'passphrase')}
                shape='pill'
                size='small'
              >
                <Text variant='compactAction'>Submit</Text>
              </Button>
              {allowsDeviceEntry ? (
                <Button
                  appearance='control'
                  label='Enter passphrase on Trezor'
                  onPress={() => submitTrezorInput(signer, 'device-passphrase')}
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
            <AppIcon name='file' size={14} />
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

  return (
    <Stack grow gap='none'>
      <SidePanelHeader closeLabel='Back' onClose={backInlineAdd} title='Add account' />
      <ScrollArea height='fill'>
        <Surface padding='medium' radius='none' tone='transparent'>
          {state.addAccountCategory === 'createSeed'
            ? renderCreateSeedPhrase()
            : state.addAccountCategory === 'storedSeed'
              ? renderStoredSeedAdd()
              : state.addAccountCategory === 'import'
                ? state.addAccountType
                  ? renderInlineAddForm()
                  : renderOptions(addOptions.import, state.addAccountType, chooseInlineAddType)
                : state.addAccountCategory === 'hardware'
                  ? state.addAccountType
                    ? renderHardwareAdd()
                    : renderOptions(addOptions.hardware, state.addAccountType, chooseInlineAddType)
                  : state.addAccountCategory === 'watch'
                    ? renderInlineAddForm()
                    : renderOptions(addOptions.root, state.addAccountCategory, chooseInlineAddCategory)}
        </Surface>
      </ScrollArea>
    </Stack>
  )
}
