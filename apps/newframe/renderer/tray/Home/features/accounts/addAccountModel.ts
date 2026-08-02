export const emptyAddAccountDraft = {
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
}

export const normalizeAddAccountType = (type = '') =>
  ({ keyring: 'privateKey', nonsigning: 'watch' })[type] || type

export function addAccountCategoryForType(type = '') {
  if (['seed', 'privateKey', 'keystore'].includes(type)) return 'import'
  if (['ledger', 'trezor', 'lattice'].includes(type)) return 'hardware'
  return type === 'watch' ? 'watch' : ''
}

export const onboardingStatusText = (phase = '', fallback = '') =>
  ({
    adding_account: 'Adding account',
    importing: 'Adding account',
    resolving_address: 'Resolving address',
    connecting: 'Connecting hardware wallet',
    deriving: 'Loading accounts'
  })[phase] || fallback

export function hardwarePageModel(
  signer: { type?: string; status?: string; addresses?: string[] } | null | undefined,
  requestedPage: number,
  liveLedger = false
) {
  const addresses = Array.isArray(signer?.addresses) ? signer.addresses : []
  const maxPage = signer?.type === 'ledger' ? 20 : Math.max(1, Math.ceil(addresses.length / 5))
  const page = Math.max(1, Math.min(maxPage, Math.trunc(requestedPage) || 1))
  const start = (page - 1) * 5
  const requiredAddressCount = page * 5
  const missingAddresses = signer?.type === 'ledger' && requiredAddressCount > addresses.length
  return {
    addresses: addresses.slice(start, requiredAddressCount),
    maxPage,
    page,
    start,
    requiredAddressCount,
    missingAddresses,
    loading: liveLedger && missingAddresses
  }
}
