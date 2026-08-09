import type { QueryResultMap } from '../../../app/contracts/operations'
import { addAccountCategoryForType, emptyAddAccountDraft, normalizeAddAccountType } from './addAccountModel'

type Keystore = Extract<QueryResultMap['keystore.locate'], { ok: true }>['keystore']

export interface AddAccountState {
  addAccountCategory: string
  addAccountError: string
  addAccountInput: string
  addAccountKeystore: Keystore | null
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

export type AddAccountEvent =
  | { type: 'feedback.changed'; error: string; status: string }
  | { type: 'vault.loaded'; vault: { exists: boolean; unlocked: boolean } }
  | { type: 'flow.reset' }
  | { type: 'flow.category-selected'; category: string }
  | { type: 'flow.type-selected'; accountType: string }
  | { type: 'flow.signer-cleared' }
  | { type: 'flow.import-seed-opened' }
  | { type: 'form.input-changed'; value: string }
  | { type: 'form.name-changed'; value: string }
  | { type: 'form.password-changed'; value: string }
  | { type: 'form.keystore-password-changed'; value: string }
  | { type: 'stored-seed.expanded'; signerId: string }
  | { type: 'hardware.signer-selected'; signerId: string }
  | { type: 'hardware.signer-removed' }
  | { type: 'hardware.lattice-created'; signerId: string }
  | { type: 'hardware.pin-appended'; digit: number }
  | { type: 'hardware.pin-deleted' }
  | { type: 'hardware.phrase-changed'; value: string }
  | { type: 'hardware.pair-code-changed'; value: string }
  | { type: 'hardware.input-submitted'; input: 'pin' | 'passphrase' | 'device-passphrase'; status: string }
  | { type: 'hardware.paired' }
  | { type: 'keystore.selecting' }
  | { type: 'keystore.selected'; keystore: Keystore }
  | { type: 'keystore.failed'; error: string }
  | { type: 'seed.generating' }
  | { type: 'seed.generated'; phrase: string }
  | { type: 'seed.failed'; error: string }
  | { type: 'seed.copy-changed'; copied: boolean }
  | { type: 'seed.backup-toggled' }

function resetDraft(state: AddAccountState) {
  return {
    ...state,
    ...emptyAddAccountDraft,
    addAccountKeystore: null
  }
}

export function createAddAccountState(input: {
  initialSelectedSigner: string
  initialType: string
}): AddAccountState {
  const addAccountType = normalizeAddAccountType(input.initialType)
  return {
    ...emptyAddAccountDraft,
    addAccountCategory: addAccountCategoryForType(addAccountType),
    addAccountKeystore: null,
    addAccountType,
    addAccountName: addAccountType === 'lattice' ? 'GridPlus' : '',
    addAccountSelectedSigner: input.initialSelectedSigner,
    storedSeedExpanded: {},
    addVaultState: null
  }
}

export function addAccountReducer(state: AddAccountState, event: AddAccountEvent): AddAccountState {
  switch (event.type) {
    case 'feedback.changed':
      return { ...state, addAccountError: event.error, addAccountStatus: event.status }
    case 'vault.loaded':
      return { ...state, addVaultState: event.vault }
    case 'flow.reset':
      return { ...resetDraft(state), addAccountCategory: '', addAccountType: '', addVaultState: null }
    case 'flow.category-selected': {
      const reset = resetDraft(state)
      return {
        ...reset,
        addAccountCategory: event.category,
        addAccountType: event.category === 'watch' ? 'watch' : event.category === 'createSeed' ? 'seed' : ''
      }
    }
    case 'flow.type-selected':
      return { ...resetDraft(state), addAccountType: event.accountType }
    case 'flow.signer-cleared':
      return { ...state, addAccountSelectedSigner: '', addAccountError: '', addAccountStatus: '' }
    case 'flow.import-seed-opened':
      return { ...state, addAccountCategory: 'import', addAccountType: 'seed' }
    case 'form.input-changed':
      return { ...state, addAccountInput: event.value }
    case 'form.name-changed':
      return { ...state, addAccountName: event.value }
    case 'form.password-changed':
      return { ...state, addAccountPassword: event.value }
    case 'form.keystore-password-changed':
      return { ...state, addAccountKeystorePassword: event.value }
    case 'stored-seed.expanded':
      return { ...state, storedSeedExpanded: { ...state.storedSeedExpanded, [event.signerId]: true } }
    case 'hardware.signer-selected':
      return {
        ...state,
        addAccountSelectedSigner: event.signerId,
        addAccountError: '',
        addAccountStatus: '',
        addHardwarePin: '',
        addHardwarePhrase: '',
        addHardwarePairCode: ''
      }
    case 'hardware.signer-removed':
      return { ...state, addAccountSelectedSigner: '', addAccountError: '', addAccountStatus: '' }
    case 'hardware.lattice-created':
      return {
        ...state,
        addAccountSelectedSigner: event.signerId,
        addAccountInput: '',
        addAccountName: 'GridPlus',
        addAccountError: ''
      }
    case 'hardware.pin-appended':
      return { ...state, addHardwarePin: `${state.addHardwarePin}${event.digit}` }
    case 'hardware.pin-deleted':
      return { ...state, addHardwarePin: state.addHardwarePin.slice(0, -1) }
    case 'hardware.phrase-changed':
      return { ...state, addHardwarePhrase: event.value }
    case 'hardware.pair-code-changed':
      return { ...state, addHardwarePairCode: event.value.toUpperCase() }
    case 'hardware.input-submitted':
      return {
        ...state,
        addHardwarePin: event.input === 'pin' ? '' : state.addHardwarePin,
        addHardwarePhrase: event.input === 'passphrase' ? '' : state.addHardwarePhrase,
        addAccountError: '',
        addAccountStatus: event.status
      }
    case 'hardware.paired':
      return { ...state, addHardwarePairCode: '', addAccountError: '', addAccountStatus: 'GridPlus paired' }
    case 'keystore.selecting':
      return { ...state, addAccountError: '', addAccountStatus: 'Selecting JSON backup file' }
    case 'keystore.selected':
      return {
        ...state,
        addAccountKeystore: event.keystore,
        addAccountError: '',
        addAccountStatus: 'JSON backup file selected'
      }
    case 'keystore.failed':
      return { ...state, addAccountKeystore: null, addAccountError: event.error, addAccountStatus: '' }
    case 'seed.generating':
      return {
        ...state,
        addAccountError: '',
        addAccountStatus: 'Generating recovery phrase',
        addGeneratedPhrase: '',
        addGeneratedPhraseBackedUp: false,
        addGeneratedPhraseCopied: false
      }
    case 'seed.generated':
      return { ...state, addGeneratedPhrase: event.phrase, addAccountError: '', addAccountStatus: '' }
    case 'seed.failed':
      return { ...state, addGeneratedPhrase: '', addAccountError: event.error, addAccountStatus: '' }
    case 'seed.copy-changed':
      return { ...state, addGeneratedPhraseCopied: event.copied }
    case 'seed.backup-toggled':
      return { ...state, addGeneratedPhraseBackedUp: !state.addGeneratedPhraseBackedUp }
  }
}
