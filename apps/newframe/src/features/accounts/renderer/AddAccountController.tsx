import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import type { CommandResult } from '../../../app/contracts/operations'
import { signerIsLoading, signerTypeLabel } from '../../../shared/renderer/ui/signerPresentation'
import { createBalanceSummarySelector, formatUsdRate } from '../../asset-data/domain/balance'
import { useWalletSelector } from '../../../platform/state-sync/renderer/useAppSelector'
import type { WalletRendererState } from '../../../platform/state-sync/contract/projections'
import { hardwarePageModel, onboardingStatusText } from './addAccountModel'
import type { AccountsCapability } from './accountsCapability'
import { useHardwareSessionController } from './useHardwareSession'
import { addAccountReducer, createAddAccountState } from './addAccountReducer'
import type { AccountProjection, SignerProjection } from './accountsModel'
import {
  AddAccountView,
  type AddAccountAddressRowModel,
  type AddAccountFlowModel,
  type AddAccountOption
} from './AddAccountView'

const addOptions: Record<'root' | 'import' | 'hardware', AddAccountOption[]> = {
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

const EMPTY_ACCOUNTS: WalletRendererState['accounts'] = {}
const EMPTY_BALANCES: WalletRendererState['balances'] = {}
const EMPTY_NETWORKS: WalletRendererState['networks']['ethereum'] = {}
const EMPTY_NETWORK_METADATA: WalletRendererState['networksMeta']['ethereum'] = {}
const EMPTY_OPERATIONS: WalletRendererState['operations'] = {}
const EMPTY_RATES: WalletRendererState['assetRates'] = {}
const EMPTY_SIGNERS: WalletRendererState['signers'] = {}

function operationError(result: unknown, fallback: string) {
  if (typeof result !== 'object' || result === null || !('message' in result)) return fallback
  return typeof result.message === 'string' && result.message ? result.message : fallback
}

type Submission = { operationId: string; type: string }

function useSubmission(setFeedback: (error: string, status: string) => void) {
  const [submission, setSubmission] = useState<Submission | null>(null)
  const submissionRef = useRef(submission)
  const setActive = (next: Submission | null) => {
    submissionRef.current = next
    setSubmission(next)
  }
  const fail = (operationId: string, error: unknown, fallback: string) => {
    if (submissionRef.current?.operationId !== operationId) return false
    setActive(null)
    setFeedback(operationError(error, fallback), '')
    return true
  }
  const run = async (
    type: string,
    command: (operationId: string) => Promise<CommandResult>,
    fallback: string,
    clearFeedback = true
  ) => {
    const operationId = crypto.randomUUID()
    setActive({ operationId, type })
    if (clearFeedback) setFeedback('', '')
    try {
      const result = await command(operationId)
      if (!result.ok) fail(operationId, result, fallback)
    } catch (error) {
      fail(operationId, error, fallback)
    }
  }
  return { fail, run, setActive, submission, submissionRef }
}

export function AddAccountController({
  capability,
  initialSelectedSigner = '',
  initialType = '',
  onClose
}: {
  capability: AccountsCapability
  initialSelectedSigner?: string
  initialType?: string
  onClose: () => void
}) {
  const shared = useWalletSelector(
    useShallow((state) => ({
      accounts: state.accounts || EMPTY_ACCOUNTS,
      currentAccount: state.currentAccount || '',
      balances: state.balances || EMPTY_BALANCES,
      ledger: state.ledger,
      networks: state.networks?.ethereum || EMPTY_NETWORKS,
      networksMeta: state.networksMeta?.ethereum || EMPTY_NETWORK_METADATA,
      operations: state.operations || EMPTY_OPERATIONS,
      assetRates: state.assetRates || EMPTY_RATES,
      tokens: state.tokens,
      showLocalNameWithENS: !!state.showLocalNameWithENS,
      showTestnets: !!state.showTestnets,
      signers: state.signers || EMPTY_SIGNERS
    }))
  )
  const seedPhraseCopiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const initialHardwareSessionStarted = useRef(false)
  const [selectBalanceSummaries] = useState(() => createBalanceSummarySelector())
  const [state, dispatch] = useReducer(
    addAccountReducer,
    { initialSelectedSigner, initialType },
    createAddAccountState
  )
  const [hardwarePage, setHardwarePage] = useState(1)
  const [hardwarePageInput, setHardwarePageInput] = useState('1')
  const [addressChainUsageResult, setAddressChainUsageResult] = useState<{
    key: string
    usage: Record<string, { chainIds: number[]; complete: boolean }>
  }>({ key: '', usage: {} })
  const addressChainUsageRequest = useRef(0)
  const [pendingExistingAccount, setPendingExistingAccount] = useState('')
  const setFeedback = (error: string, status: string) => dispatch({ type: 'feedback.changed', error, status })
  const {
    fail: failSubmission,
    run: runSubmission,
    setActive: setActiveSubmission,
    submission,
    submissionRef
  } = useSubmission(setFeedback)
  const {
    start: startHardwareSession,
    finish: finishHardwareSession,
    session: hardwareSession,
    sessionRef: hardwareSessionRef,
    adopt: setActiveHardwareSession
  } = useHardwareSessionController(capability, (session, type) =>
    setActiveSubmission({ operationId: session.operationId, type })
  )
  const beginHardwareSession = (signerId: string, reload: boolean) =>
    startHardwareSession(signerId, { reload })
  const whenCurrent = (
    ref: typeof submissionRef | typeof hardwareSessionRef,
    operationId: string,
    action: () => void
  ) => queueMicrotask(() => ref.current?.operationId === operationId && action())
  const selectedHardwareSigner = state.addAccountSelectedSigner
    ? shared.signers[state.addAccountSelectedSigner]
    : null
  const selectedHardwarePage = useMemo(
    () => hardwarePageModel(selectedHardwareSigner, hardwarePage, shared.ledger?.derivation === 'live'),
    [hardwarePage, selectedHardwareSigner, shared.ledger?.derivation]
  )
  const visibleHardwareAddresses = selectedHardwarePage.addresses
  const visibleHardwareAddressKey = visibleHardwareAddresses
    .map((address: string) => address.toLowerCase())
    .join(',')
  const enabledChainKey = Object.values(shared.networks)
    .filter((chain) => chain.on)
    .map((chain) => chain.id)
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

    void capability
      .inspectAddressChainUsage({ addresses })
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
    capability,
    addressChainUsageKey,
    selectedHardwareSigner?.id,
    selectedHardwareSigner?.type,
    visibleHardwareAddresses
  ])

  function resetInlineAdd() {
    finishHardwareSession('cancelled')
    dispatch({ type: 'flow.reset' })
    onClose()
  }

  useEffect(() => {
    let active = true

    async function refreshAddVaultState() {
      try {
        const status = await capability.getSecurityStatus()
        if (!active) return

        dispatch({
          type: 'vault.loaded',
          vault: status.ok
            ? { exists: status.vaultExists, unlocked: !status.locked }
            : { exists: false, unlocked: false }
        })
      } catch {
        if (active) dispatch({ type: 'vault.loaded', vault: { exists: false, unlocked: false } })
      }
    }

    void refreshAddVaultState()
    return () => {
      active = false
      clearTimeout(seedPhraseCopiedTimeoutRef.current)
    }
  }, [capability])

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

    const signerId = onboardingOperation.entityRefs?.find((ref) => ref.type === 'signer')?.id
    if (submission.type === 'signer.lattice-create' && signerId && hardwareSession?.signerId !== signerId) {
      whenCurrent(submissionRef, operationId, () => {
        dispatch({ type: 'hardware.lattice-created', signerId })
        setActiveHardwareSession({ operationId, signerId })
      })
    }

    if (onboardingOperation.status !== 'succeeded') return
    if (['account.add-from-signer', 'account.watch-add', 'signer.import'].includes(submission.type)) {
      whenCurrent(submissionRef, operationId, resetInlineAdd)
    } else if (submission.type === 'signer.lattice-pair') {
      whenCurrent(submissionRef, operationId, () => {
        dispatch({ type: 'hardware.paired' })
        setActiveSubmission(null)
      })
    } else {
      whenCurrent(submissionRef, operationId, () => setActiveSubmission(null))
    }
    // resetInlineAdd intentionally reads the latest local draft through the render closure.
    // oxlint-disable-next-line react/exhaustive-deps
  }, [hardwareSession?.signerId, onboardingOperation, submission])

  useEffect(() => {
    if (!hardwareSession) return
    const signer = shared.signers[hardwareSession.signerId]
    const session = shared.operations[hardwareSession.operationId]
    const operationId = hardwareSession.operationId
    if (session?.status === 'failed') {
      whenCurrent(hardwareSessionRef, operationId, () => {
        setFeedback(session.error?.message || 'Could not complete the hardware operation.', '')
        setActiveHardwareSession(null)
      })
      return
    }
    if (signer?.status?.toLowerCase() !== 'ok') return

    whenCurrent(hardwareSessionRef, operationId, () => finishHardwareSession('ready'))
    // finishHardwareSession is intentionally guarded by the mutable active-session reference.
    // oxlint-disable-next-line react/exhaustive-deps
  }, [hardwareSession, shared.operations, shared.signers])

  useEffect(() => {
    if (!initialSelectedSigner || initialHardwareSessionStarted.current) return
    initialHardwareSessionStarted.current = true
    queueMicrotask(() => beginHardwareSession(initialSelectedSigner, false))
    // This mount-only bootstrap is keyed solely by the requested initial signer.
    // oxlint-disable-next-line react/exhaustive-deps
  }, [initialSelectedSigner])

  async function selectExistingAccount(id: string) {
    if (pendingExistingAccount) return
    setPendingExistingAccount(id)
    setFeedback('', 'Selecting account')

    try {
      const result = await capability.selectAccount({ accountId: id })
      if (result.ok) return

      setPendingExistingAccount('')
      setFeedback(operationError(result, 'Could not select account'), '')
    } catch {
      setPendingExistingAccount('')
      setFeedback('Could not select account', '')
    }
  }

  function accountDisplayName(account: AccountProjection | undefined) {
    if (!account) return ''
    return account.ensName && !shared.showLocalNameWithENS ? account.ensName : account.name
  }

  function shortAddress(address = '') {
    return address ? `${address.substring(0, 5)}…${address.substring(address.length - 4)}` : ''
  }

  function accountNavValue(account: AccountProjection | undefined) {
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

  function seedWallets(signer: SignerProjection, accounts: Record<string, AccountProjection>) {
    const addresses = Array.isArray(signer?.addresses) ? signer.addresses : []

    return addresses.map((address: string, index: number) => {
      const id = address.toLowerCase()
      return { account: accounts[id], address, id, index }
    })
  }

  function walletDisplayName(wallet: { account?: AccountProjection; index: number }) {
    return wallet.account ? accountDisplayName(wallet.account) : `Wallet ${wallet.index + 1}`
  }

  function expandStoredSeed(signerId: string) {
    dispatch({ type: 'stored-seed.expanded', signerId })
  }

  function backInlineAdd() {
    if (state.addAccountSelectedSigner) {
      finishHardwareSession('cancelled')
      dispatch({ type: 'flow.signer-cleared' })
      return
    }

    if (state.addAccountCategory) {
      dispatch({ type: 'flow.category-selected', category: '' })
      return
    }

    resetInlineAdd()
  }

  function chooseInlineAddCategory(category: string) {
    dispatch({ type: 'flow.category-selected', category })
    if (category === 'createSeed') void generateInlineSeedPhrase()
  }

  function chooseInlineAddType(type: string) {
    dispatch({ type: 'flow.type-selected', accountType: type })
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

  async function addSignerAddress(signer: SignerProjection, address: string, name: string, fallback: string) {
    if (!signer?.id || !address) return
    const accounts = shared.accounts
    const id = address.toLowerCase()

    if (accounts[id]) {
      if (shared.currentAccount.toLowerCase() === id) return resetInlineAdd()
      void selectExistingAccount(id)
      return
    }

    await runSubmission(
      'account.add-from-signer',
      (operationId) => capability.addAccountFromSigner({ operationId, signerId: signer.id, address, name }),
      fallback
    )
  }

  async function locateInlineKeystore() {
    dispatch({ type: 'keystore.selecting' })

    const result = await capability.locateKeystore()
    if (result.ok) {
      dispatch({ type: 'keystore.selected', keystore: result.keystore })
    } else {
      dispatch({ type: 'keystore.failed', error: operationError(result, 'Could not select the keystore.') })
    }
  }

  function selectHardwareSigner(signerId: string) {
    setHardwarePage(1)
    setHardwarePageInput('1')
    dispatch({ type: 'hardware.signer-selected', signerId })
    beginHardwareSession(signerId, false)
  }

  async function createLatticeSigner() {
    const deviceId = (state.addAccountInput || '').trim()
    const deviceName = (state.addAccountName || '').trim() || 'GridPlus'

    if (!deviceId) return setFeedback('Device ID required', '')

    await runSubmission(
      'signer.lattice-create',
      (operationId) => capability.createLatticeSigner({ operationId, deviceId, deviceName }),
      'Could not create the GridPlus signer.'
    )
  }

  function hardwareAccountName(signer: SignerProjection) {
    const label = signerTypeLabel(signer?.type, 'Hardware')
    return `${label} Account`
  }

  function reloadHardwareSigner(signer: SignerProjection) {
    if (!signer?.id) return
    beginHardwareSession(signer.id, true)
    setFeedback('', '')
  }

  function removeHardwareSigner(signer: SignerProjection) {
    if (!signer?.id) return
    const operationId = crypto.randomUUID()
    setActiveSubmission({ operationId, type: 'signer.disconnect' })
    void capability.disconnectSigner({ operationId, signerId: signer.id })
    dispatch({ type: 'hardware.signer-removed' })
  }

  function addHardwarePinDigit(num: number) {
    dispatch({ type: 'hardware.pin-appended', digit: num })
  }

  function backspaceHardwarePin() {
    dispatch({ type: 'hardware.pin-deleted' })
  }

  function submitTrezorInput(signer: SignerProjection, input: 'pin' | 'passphrase' | 'device-passphrase') {
    if (!signer?.id) return
    if (input === 'pin' && !state.addHardwarePin) return setFeedback('PIN required', '')
    if (!hardwareSession || hardwareSession.signerId !== signer.id) {
      return setFeedback('Reconnect the hardware wallet first', '')
    }
    const actionId = crypto.randomUUID()
    setActiveSubmission({ operationId: actionId, type: 'signer.trezor-input' })
    const value = input === 'pin' ? state.addHardwarePin : state.addHardwarePhrase
    const command =
      input === 'device-passphrase'
        ? {
            operationId: hardwareSession.operationId,
            actionId,
            signerId: signer.id,
            input
          }
        : {
            operationId: hardwareSession.operationId,
            actionId,
            signerId: signer.id,
            input,
            value
          }
    void capability.submitTrezorInput(command)
    dispatch({
      type: 'hardware.input-submitted',
      input,
      status:
        input === 'pin'
          ? 'PIN submitted'
          : input === 'passphrase'
            ? 'Passphrase submitted'
            : 'Continue on device'
    })
  }

  async function pairHardwareLattice(signer: SignerProjection) {
    if (!signer?.id) return
    if (!state.addHardwarePairCode) return setFeedback('Pairing code required', '')
    if (!hardwareSession || hardwareSession.signerId !== signer.id) {
      return setFeedback('Reconnect the hardware wallet first', '')
    }
    const actionId = crypto.randomUUID()
    setActiveSubmission({ operationId: actionId, type: 'signer.lattice-pair' })

    const result = await capability.pairLattice({
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

    if (!addAccountType) return setFeedback('Choose an account type', '')
    if (addAccountType !== 'keystore' && !input) {
      return setFeedback('Account input required', '')
    }
    if (needsFramePassword() && !addAccountPassword) {
      return setFeedback(`${framePasswordLabel()} required`, '')
    }

    const operationId = crypto.randomUUID()
    const operationType = addAccountType === 'watch' ? 'account.watch-add' : 'signer.import'
    setActiveSubmission({ operationId, type: operationType })
    setFeedback('', '')

    try {
      const result =
        addAccountType === 'watch'
          ? await capability.addWatchAccount({
              operationId,
              addressOrName: input,
              name: name || 'Watch Account'
            })
          : addAccountType === 'keystore'
            ? addAccountKeystore && addAccountKeystorePassword
              ? await capability.importSigner({
                  operationId,
                  source: 'keystore',
                  keystore: addAccountKeystore,
                  keystorePassword: addAccountKeystorePassword,
                  framePassword: addAccountPassword,
                  accountName: name || 'Hot Account'
                })
              : null
            : await capability.importSigner(
                addAccountType === 'seed'
                  ? {
                      operationId,
                      source: 'phrase',
                      phrase: input,
                      framePassword: addAccountPassword,
                      accountName: name || 'Hot Account'
                    }
                  : {
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
    } catch (err: unknown) {
      failSubmission(operationId, err, 'Could not add the account.')
    }
  }

  async function generateInlineSeedPhrase() {
    dispatch({ type: 'seed.generating' })

    const result = await capability.generateSeed()
    if (result.ok) {
      dispatch({ type: 'seed.generated', phrase: result.phrase })
    } else {
      dispatch({
        type: 'seed.failed',
        error: operationError(result, 'Could not generate a recovery phrase.')
      })
    }
  }

  function copyGeneratedSeedPhrase() {
    const phrase = state.addGeneratedPhrase
    if (!phrase) return

    clearTimeout(seedPhraseCopiedTimeoutRef.current)
    void capability.writeClipboard({ text: phrase })
    dispatch({ type: 'seed.copy-changed', copied: true })
    seedPhraseCopiedTimeoutRef.current = setTimeout(
      () => dispatch({ type: 'seed.copy-changed', copied: false }),
      1_800
    )
  }

  async function createGeneratedSeedAccount() {
    const phrase = (state.addGeneratedPhrase || '').trim()
    const name = (state.addAccountName || '').trim()
    const password = state.addAccountPassword || ''

    if (!phrase) return setFeedback('Generate a recovery phrase first', '')
    if (!state.addGeneratedPhraseBackedUp) {
      return setFeedback('Confirm that you saved the recovery phrase', '')
    }
    if (needsFramePassword() && !password) {
      return setFeedback(`${framePasswordLabel()} required`, '')
    }

    await runSubmission(
      'signer.import',
      (operationId) =>
        capability.importSigner({
          operationId,
          source: 'phrase',
          phrase,
          framePassword: password,
          accountName: name || 'Hot Account'
        }),
      'Could not create the account.'
    )
  }

  function addressRowModel(input: {
    address: string
    chainUsage?: { chainIds: number[]; complete: boolean }
    imported: boolean
    index: number
    label: string
    usageLoading?: boolean
    value?: string
  }): AddAccountAddressRowModel {
    const usage = input.usageLoading
      ? 'loading'
      : input.chainUsage?.chainIds.length
        ? 'used'
        : input.chainUsage?.complete
          ? 'unused'
          : input.value
            ? 'value'
            : 'unavailable'
    return {
      address: input.address,
      chains: (input.chainUsage?.chainIds || []).map(
        (chainId) => shared.networks[chainId]?.name || `Chain ${chainId}`
      ),
      imported: input.imported,
      index: input.index,
      label: input.label,
      shortAddress: shortAddress(input.address),
      usage,
      value: input.value
    }
  }

  function storedSeedFlow(): Extract<AddAccountFlowModel, { kind: 'stored-seed' }> {
    const signers = Object.values(shared.signers).filter((signer) => signer.type === 'seed')
    const selectedSigner = state.addAccountSelectedSigner
      ? shared.signers[state.addAccountSelectedSigner]
      : undefined
    if (!signers.length) return { kind: 'stored-seed', model: { mode: 'empty' } }
    if (!selectedSigner) {
      return {
        kind: 'stored-seed',
        model: {
          mode: 'seeds',
          seeds: signers.map((signer, index) => {
            const wallets = seedWallets(signer, shared.accounts)
            const imported = wallets.filter((wallet) => wallet.account)
            const expanded = Boolean(state.storedSeedExpanded[signer.id])
            return {
              expanded,
              id: signer.id,
              importedCount: imported.length,
              label: seedPhraseLabel(index),
              totalCount: wallets.length,
              wallets: (expanded ? imported : imported.slice(0, 3)).map((wallet) => ({
                address: wallet.address,
                name: walletDisplayName(wallet),
                shortAddress: shortAddress(wallet.address)
              }))
            }
          })
        }
      }
    }
    return {
      kind: 'stored-seed',
      model: {
        mode: 'addresses',
        error: state.addAccountError,
        rows: selectedSigner.addresses.map((address, index) => {
          const account = shared.accounts[address.toLowerCase()]
          return addressRowModel({
            address,
            imported: Boolean(account),
            index,
            label: walletDisplayName({ account, index }),
            value: account ? accountNavValue(account) : '$0.00'
          })
        }),
        status: displayedStatus
      }
    }
  }

  function hardwareFlow(): Extract<AddAccountFlowModel, { kind: 'hardware' }> {
    const type = state.addAccountType
    const title = type === 'ledger' ? 'Ledger' : type === 'trezor' ? 'Trezor' : 'GridPlus'
    const signers = Object.values(shared.signers).filter((signer) => signer.type === type)
    const signer = selectedHardwareSigner?.type === type ? selectedHardwareSigner : undefined
    if (!signer) {
      return {
        kind: 'hardware',
        model: {
          mode: 'list',
          deviceId: state.addAccountInput,
          deviceName: state.addAccountName,
          error: state.addAccountError,
          signers: signers.map((candidate) => ({
            addressCount: candidate.addresses.length,
            id: candidate.id,
            name: candidate.name || title,
            status: candidate.status || 'Detected',
            type: candidate.type
          })),
          status: displayedStatus,
          title,
          type
        }
      }
    }
    const status = signer.status.toLowerCase()
    const loading = signerIsLoading(status)
    const input =
      signer.type === 'trezor' && status === 'need pin'
        ? { kind: 'pin' as const, length: state.addHardwarePin.length }
        : signer.type === 'trezor' && status === 'enter passphrase'
          ? {
              kind: 'passphrase' as const,
              allowsDeviceEntry: (signer.capabilities || []).includes('Capability_PassphraseEntry'),
              value: state.addHardwarePhrase
            }
          : signer.type === 'lattice' && status === 'pair'
            ? { kind: 'pair' as const, value: state.addHardwarePairCode }
            : { kind: 'none' as const }
    const rows = selectedHardwarePage.addresses.map((address, index) => {
      const account = shared.accounts[address.toLowerCase()]
      return addressRowModel({
        address,
        chainUsage: addressChainUsage[address.toLowerCase()],
        imported: Boolean(account),
        index: selectedHardwarePage.start + index,
        label: shortAddress(address),
        usageLoading: addressChainUsageLoading
      })
    })
    return {
      kind: 'hardware',
      model: {
        mode: 'details',
        emptyText:
          loading || selectedHardwarePage.missingAddresses
            ? `Loading page ${hardwarePage}`
            : 'No accounts loaded for this page',
        error: state.addAccountError,
        input,
        pagination:
          selectedHardwarePage.maxPage > 1
            ? { input: hardwarePageInput, maxPage: selectedHardwarePage.maxPage, page: hardwarePage }
            : null,
        rows,
        signer: {
          id: signer.id,
          loading,
          name: signer.name || title,
          status: signer.status || 'Detected',
          type: signer.type
        },
        status: displayedStatus,
        title
      }
    }
  }

  const flow: AddAccountFlowModel =
    state.addAccountCategory === 'createSeed'
      ? {
          kind: 'generated-seed',
          model: {
            backedUp: state.addGeneratedPhraseBackedUp,
            copied: state.addGeneratedPhraseCopied,
            error: state.addAccountError,
            name: state.addAccountName,
            needsFramePassword: needsFramePassword(),
            password: state.addAccountPassword,
            passwordLabel: framePasswordLabel(),
            status: displayedStatus,
            words: state.addGeneratedPhrase.trim().split(/\s+/).filter(Boolean)
          }
        }
      : state.addAccountCategory === 'storedSeed'
        ? storedSeedFlow()
        : state.addAccountCategory === 'import' && !state.addAccountType
          ? { kind: 'methods', options: addOptions.import, selected: state.addAccountType }
          : state.addAccountCategory === 'hardware' && !state.addAccountType
            ? { kind: 'methods', options: addOptions.hardware, selected: state.addAccountType }
            : state.addAccountCategory === 'hardware'
              ? hardwareFlow()
              : state.addAccountCategory === 'watch' || state.addAccountCategory === 'import'
                ? {
                    kind: 'import',
                    model: {
                      accountType: state.addAccountType,
                      error: state.addAccountError,
                      input: state.addAccountInput,
                      keystorePassword: state.addAccountKeystorePassword,
                      keystoreSelected: Boolean(state.addAccountKeystore),
                      name: state.addAccountName,
                      needsFramePassword: needsFramePassword(),
                      password: state.addAccountPassword,
                      passwordLabel: framePasswordLabel(),
                      status: displayedStatus
                    }
                  }
                : { kind: 'methods', options: addOptions.root, selected: state.addAccountCategory }

  const selectedSigner = () =>
    state.addAccountSelectedSigner ? shared.signers[state.addAccountSelectedSigner] : undefined
  const selectHardwarePage = async (signer: SignerProjection, requestedPage: number) => {
    const pageModel = hardwarePageModel(signer, requestedPage, shared.ledger?.derivation === 'live')
    setHardwarePage(pageModel.page)
    setHardwarePageInput(String(pageModel.page))
    if (!pageModel.loading) return
    await runSubmission(
      'signer.ledger-accounts-load',
      (operationId) =>
        capability.loadLedgerAccounts({
          operationId,
          signerId: signer.id,
          accountCount: pageModel.requiredAddressCount
        }),
      'Could not load that Ledger account page.',
      false
    )
  }
  const events = {
    onBack: backInlineAdd,
    onCategorySelect: chooseInlineAddCategory,
    onCreateGeneratedSeed: () => void createGeneratedSeedAccount(),
    onCreateLattice: () => void createLatticeSigner(),
    onCreateSeedOpen: () => chooseInlineAddCategory('createSeed'),
    onGeneratedSeedBackupToggle: () => dispatch({ type: 'seed.backup-toggled' } as const),
    onGeneratedSeedCopy: copyGeneratedSeedPhrase,
    onGeneratedSeedRegenerate: () => void generateInlineSeedPhrase(),
    onHardwareAddressSelect: (address: string) => {
      const signer = selectedSigner()
      if (signer)
        void addSignerAddress(
          signer,
          address,
          hardwareAccountName(signer),
          'Could not add the hardware account.'
        )
    },
    onHardwarePair: () => {
      const signer = selectedSigner()
      if (signer) void pairHardwareLattice(signer)
    },
    onHardwarePairCodeChange: (value: string) =>
      dispatch({ type: 'hardware.pair-code-changed', value } as const),
    onHardwarePassphraseChange: (value: string) =>
      dispatch({ type: 'hardware.phrase-changed', value } as const),
    onHardwarePinAppend: addHardwarePinDigit,
    onHardwarePinDelete: backspaceHardwarePin,
    onHardwareReload: () => {
      const signer = selectedSigner()
      if (signer) reloadHardwareSigner(signer)
    },
    onHardwareRemove: () => {
      const signer = selectedSigner()
      if (signer) removeHardwareSigner(signer)
    },
    onHardwareSelect: selectHardwareSigner,
    onHardwareSubmit: (hardwareInput: 'pin' | 'passphrase' | 'device-passphrase') => {
      const signer = selectedSigner()
      if (signer) submitTrezorInput(signer, hardwareInput)
    },
    onImportSeedOpen: () => dispatch({ type: 'flow.import-seed-opened' } as const),
    onInputChange: (value: string) => dispatch({ type: 'form.input-changed', value } as const),
    onKeystoreLocate: () => void locateInlineKeystore(),
    onKeystorePasswordChange: (value: string) =>
      dispatch({ type: 'form.keystore-password-changed', value } as const),
    onLatticeNameChange: (value: string) =>
      dispatch({ type: 'form.name-changed', value: value.replace(/\s+/g, '-').substring(0, 14) } as const),
    onNameChange: (value: string) => dispatch({ type: 'form.name-changed', value } as const),
    onPageChange: (page: number) => {
      const signer = selectedSigner()
      if (signer) void selectHardwarePage(signer, page)
    },
    onPageInputChange: setHardwarePageInput,
    onPasswordChange: (value: string) => dispatch({ type: 'form.password-changed', value } as const),
    onStoredSeedAddressSelect: (address: string) => {
      const signer = selectedSigner()
      if (signer) void addSignerAddress(signer, address, 'Hot Account', 'Could not add the account.')
    },
    onStoredSeedExpand: expandStoredSeed,
    onStoredSeedSelect: (signerId: string) =>
      dispatch({ type: 'hardware.signer-selected', signerId } as const),
    onSubmitImport: () => void createInlineAccount(),
    onTypeSelect: chooseInlineAddType
  }

  return <AddAccountView events={events} flow={flow} />
}
