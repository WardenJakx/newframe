type AccountsPanel = { kind: 'list' } | { kind: 'add' } | { kind: 'export'; accountId: string }

type AccountMoveState =
  | { kind: 'closed' }
  | { kind: 'open'; accountId: string; error: string }
  | { kind: 'pending'; accountId: string; operationId: string; profileId: string }
  | { kind: 'failed'; accountId: string; error: string }

interface AccountExportState {
  copied: boolean
  error: string
  loading: boolean
  password: string
  revealed: boolean
  secret: string
}

export interface AccountsState {
  copiedAccountId: string
  drag: { accountId: string; overAccountId: string }
  export: AccountExportState
  menuAccountId: string
  move: AccountMoveState
  panel: AccountsPanel
  query: string
  removingAccountId: string
  renamingAccountId: string
}

export type AccountsEvent =
  | { type: 'search.changed'; query: string }
  | { type: 'copy.shown'; accountId: string }
  | { type: 'copy.cleared' }
  | { type: 'panel.add-opened' }
  | { type: 'panel.list-opened' }
  | { type: 'panel.export-opened'; accountId: string }
  | { type: 'panel.export-closed' }
  | { type: 'menu.toggled'; accountId: string }
  | { type: 'menu.closed' }
  | { type: 'rename.opened'; accountId: string }
  | { type: 'rename.closed' }
  | { type: 'remove.opened'; accountId: string }
  | { type: 'remove.closed' }
  | { type: 'move.opened'; accountId: string }
  | { type: 'move.started'; accountId: string; operationId: string; profileId: string }
  | { type: 'move.failed'; accountId: string; error: string }
  | { type: 'move.closed' }
  | { type: 'export.password-changed'; password: string }
  | { type: 'export.unlock-started' }
  | { type: 'export.unlock-succeeded'; secret: string }
  | { type: 'export.unlock-failed'; error: string }
  | { type: 'export.reveal-toggled' }
  | { type: 'export.copied' }
  | { type: 'drag.started'; accountId: string }
  | { type: 'drag.entered'; accountId: string }
  | { type: 'drag.ended' }

const emptyExport = (): AccountExportState => ({
  copied: false,
  error: '',
  loading: false,
  password: '',
  revealed: false,
  secret: ''
})

export function createAccountsState(showAddAccounts = false): AccountsState {
  return {
    copiedAccountId: '',
    drag: { accountId: '', overAccountId: '' },
    export: emptyExport(),
    menuAccountId: '',
    move: { kind: 'closed' },
    panel: showAddAccounts ? { kind: 'add' } : { kind: 'list' },
    query: '',
    removingAccountId: '',
    renamingAccountId: ''
  }
}

export function accountsReducer(state: AccountsState, event: AccountsEvent): AccountsState {
  switch (event.type) {
    case 'search.changed':
      return { ...state, query: event.query }
    case 'copy.shown':
      return { ...state, copiedAccountId: event.accountId }
    case 'copy.cleared':
      return { ...state, copiedAccountId: '' }
    case 'panel.add-opened':
      return { ...state, panel: { kind: 'add' }, menuAccountId: '' }
    case 'panel.list-opened':
    case 'panel.export-closed':
      return { ...state, panel: { kind: 'list' }, export: emptyExport() }
    case 'panel.export-opened':
      return {
        ...state,
        panel: { kind: 'export', accountId: event.accountId },
        export: emptyExport(),
        menuAccountId: '',
        removingAccountId: ''
      }
    case 'menu.toggled':
      return {
        ...state,
        menuAccountId: state.menuAccountId === event.accountId ? '' : event.accountId,
        move: { kind: 'closed' },
        removingAccountId: ''
      }
    case 'menu.closed':
      return { ...state, menuAccountId: '' }
    case 'rename.opened':
      return {
        ...state,
        renamingAccountId: event.accountId,
        menuAccountId: '',
        move: { kind: 'closed' },
        removingAccountId: ''
      }
    case 'rename.closed':
      return { ...state, renamingAccountId: '' }
    case 'remove.opened':
      return { ...state, removingAccountId: event.accountId }
    case 'remove.closed':
      return { ...state, removingAccountId: '' }
    case 'move.opened':
      return { ...state, move: { kind: 'open', accountId: event.accountId, error: '' } }
    case 'move.started':
      return {
        ...state,
        move: {
          kind: 'pending',
          accountId: event.accountId,
          operationId: event.operationId,
          profileId: event.profileId
        }
      }
    case 'move.failed':
      return { ...state, move: { kind: 'failed', accountId: event.accountId, error: event.error } }
    case 'move.closed':
      return { ...state, move: { kind: 'closed' } }
    case 'export.password-changed':
      return { ...state, export: { ...state.export, password: event.password } }
    case 'export.unlock-started':
      return { ...state, export: { ...state.export, loading: true, error: '', copied: false } }
    case 'export.unlock-succeeded':
      return {
        ...state,
        export: { ...emptyExport(), secret: event.secret }
      }
    case 'export.unlock-failed':
      return {
        ...state,
        export: { ...state.export, loading: false, error: event.error, secret: '', revealed: false }
      }
    case 'export.reveal-toggled':
      return { ...state, export: { ...state.export, revealed: !state.export.revealed } }
    case 'export.copied':
      return { ...state, export: { ...state.export, copied: true } }
    case 'drag.started':
      return { ...state, drag: { accountId: event.accountId, overAccountId: '' } }
    case 'drag.entered':
      return { ...state, drag: { ...state.drag, overAccountId: event.accountId } }
    case 'drag.ended':
      return { ...state, drag: { accountId: '', overAccountId: '' } }
  }
}
