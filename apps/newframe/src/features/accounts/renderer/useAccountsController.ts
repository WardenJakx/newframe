import type { DragEvent } from 'react'
import { useEffect, useReducer, useRef } from 'react'

import type { OperationRecord } from '../../../platform/operations/operation'
import type { AccountsCapability } from './accountsCapability'
import type { AccountListItem, AccountProjection } from './accountsModel'
import { accountsReducer, createAccountsState } from './accountsReducer'

function errorMessage(error: unknown, fallback: string) {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message) return message
  }
  return fallback
}

function moveError(code: string) {
  return (
    (
      {
        account_not_found: 'That account is no longer available.',
        profile_not_found: 'That profile is no longer available.',
        same_profile: 'The account is already in that profile.'
      } as Record<string, string>
    )[code] || 'Could not move the account. Try again.'
  )
}

export function useAccountsController(input: {
  accounts: Record<string, AccountProjection>
  capability: AccountsCapability
  currentAccountId: string
  initialShowAddAccounts: boolean
  onClose: () => void
  operations: Record<string, OperationRecord>
}) {
  const [state, dispatch] = useReducer(accountsReducer, input.initialShowAddAccounts, createAccountsState)
  const accountFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const accountSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const accountSearchInputRef = useRef<HTMLInputElement | null>(null)
  const activeMoveOperationRef = useRef('')
  const exportRequestRef = useRef('')
  const previousCurrentAccountRef = useRef(input.currentAccountId)

  const invalidateExportRequest = () => {
    exportRequestRef.current = ''
  }

  useEffect(
    () => () => {
      invalidateExportRequest()
      clearTimeout(accountFeedbackTimeoutRef.current)
      clearTimeout(accountSearchTimeoutRef.current)
    },
    []
  )

  useEffect(() => {
    if (previousCurrentAccountRef.current !== input.currentAccountId) {
      previousCurrentAccountRef.current = input.currentAccountId
      invalidateExportRequest()
    }
  }, [input.currentAccountId])

  useEffect(() => {
    if (state.move.kind !== 'pending') return
    const operation = input.operations[state.move.operationId]
    if (operation?.status === 'failed') {
      activeMoveOperationRef.current = ''
      dispatch({
        type: 'move.failed',
        accountId: state.move.accountId,
        error: moveError(operation.error?.code || '')
      })
      return
    }
    const account = input.accounts[state.move.accountId]
    if (operation?.status === 'succeeded' && (!account || account.profileId === state.move.profileId)) {
      activeMoveOperationRef.current = ''
      dispatch({ type: 'move.closed' })
      dispatch({ type: 'menu.closed' })
    }
  }, [input.accounts, input.operations, state.move])

  function showCopiedAccount(accountId: string) {
    clearTimeout(accountFeedbackTimeoutRef.current)
    dispatch({ type: 'copy.shown', accountId })
    accountFeedbackTimeoutRef.current = setTimeout(() => dispatch({ type: 'copy.cleared' }), 1_800)
  }

  const events = {
    onAccountAgentAccessChange: (account: AccountListItem, enabled: boolean) => {
      void input.capability.setAccountAgentAccess({ accountId: account.id, enabled })
      dispatch({ type: 'menu.closed' })
    },
    onAccountAgentSessionsRevoke: (accountId: string) => {
      void input.capability.revokeAccountAgentSessions({ accountId })
      dispatch({ type: 'menu.closed' })
    },
    onAccountCopy: (account: AccountListItem) => {
      void input.capability.writeClipboard({ text: account.address })
      showCopiedAccount(account.id)
    },
    onAccountDragEnd: () => dispatch({ type: 'drag.ended' } as const),
    onAccountDragOver: (event: DragEvent, accountId: string) => {
      if (!state.drag.accountId || state.drag.accountId === accountId) return
      event.preventDefault()
      event.stopPropagation()
      event.dataTransfer.dropEffect = 'move'
      if (state.drag.overAccountId !== accountId) dispatch({ type: 'drag.entered', accountId })
    },
    onAccountDragStart: (event: DragEvent, accountId: string) => {
      event.stopPropagation()
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', accountId)
      dispatch({ type: 'drag.started', accountId })
    },
    onAccountDrop: (event: DragEvent, accountId: string) => {
      event.preventDefault()
      event.stopPropagation()
      const fromAccountId = event.dataTransfer.getData('text/plain') || state.drag.accountId
      if (fromAccountId && fromAccountId !== accountId) {
        void input.capability.reorderAccount({ fromAccountId, toAccountId: accountId })
      }
      dispatch({ type: 'drag.ended' })
    },
    onAccountExportOpen: (accountId: string) => {
      invalidateExportRequest()
      dispatch({ type: 'panel.export-opened', accountId })
    },
    onAccountMenuToggle: (accountId: string) => dispatch({ type: 'menu.toggled', accountId } as const),
    onAccountRemove: (accountId: string, removeSeedPhrase: boolean) => {
      void input.capability.removeAccount({ address: accountId, removeSeedSigner: removeSeedPhrase })
      dispatch({ type: 'remove.closed' })
      dispatch({ type: 'menu.closed' })
    },
    onAccountRemoveCancel: () => dispatch({ type: 'remove.closed' } as const),
    onAccountRemoveOpen: (accountId: string) => dispatch({ type: 'remove.opened', accountId } as const),
    onAccountRenameCancel: () => dispatch({ type: 'rename.closed' } as const),
    onAccountRenameCommit: (accountId: string, nextName: string) => {
      const name = nextName.trim()
      if (name) void input.capability.renameAccount({ accountId, name })
      dispatch({ type: 'rename.closed' })
    },
    onAccountRenameOpen: (accountId: string) => dispatch({ type: 'rename.opened', accountId } as const),
    onAccountSelect: (accountId: string) => {
      invalidateExportRequest()
      input.onClose()
      if (accountId !== input.currentAccountId) void input.capability.selectAccount({ accountId })
    },
    onAddAccountOpen: () => dispatch({ type: 'panel.add-opened' } as const),
    onClose: input.onClose,
    onExportClose: () => {
      invalidateExportRequest()
      dispatch({ type: 'panel.export-closed' })
    },
    onExportCopy: () => {
      if (!state.export.secret) return
      void input.capability.writeClipboard({ text: state.export.secret })
      dispatch({ type: 'export.copied' })
    },
    onExportPasswordChange: (password: string) =>
      dispatch({ type: 'export.password-changed', password } as const),
    onExportRevealToggle: () => dispatch({ type: 'export.reveal-toggled' } as const),
    onExportUnlock: async () => {
      if (state.panel.kind !== 'export' || state.export.loading) return
      if (!state.export.password) {
        dispatch({ type: 'export.unlock-failed', error: 'Password required' })
        return
      }
      const account = input.accounts[state.panel.accountId]
      if (!account?.address) return
      const requestToken = crypto.randomUUID()
      exportRequestRef.current = requestToken
      dispatch({ type: 'export.unlock-started' })
      try {
        const result = await input.capability.exportAccountPrivateKey({
          accountId: account.address,
          password: state.export.password
        })
        if (exportRequestRef.current !== requestToken) return
        exportRequestRef.current = ''
        dispatch(
          result.ok
            ? { type: 'export.unlock-succeeded', secret: result.privateKey }
            : {
                type: 'export.unlock-failed',
                error: errorMessage(result, 'Could not export the private key.')
              }
        )
      } catch (error) {
        if (exportRequestRef.current !== requestToken) return
        exportRequestRef.current = ''
        dispatch({
          type: 'export.unlock-failed',
          error: errorMessage(error, 'Could not export the private key.')
        })
      }
    },
    onMoveOpenChange: (accountId: string, open: boolean) => {
      if (open) dispatch({ type: 'move.opened', accountId })
      else if (!activeMoveOperationRef.current) dispatch({ type: 'move.closed' })
    },
    onMoveSelect: async (accountId: string, profileId: string) => {
      const operationId = crypto.randomUUID()
      activeMoveOperationRef.current = operationId
      dispatch({ type: 'move.started', accountId, operationId, profileId })
      try {
        const result = await input.capability.moveAccountToProfile({ operationId, accountId, profileId })
        if (!result.ok && activeMoveOperationRef.current === operationId) {
          activeMoveOperationRef.current = ''
          dispatch({ type: 'move.failed', accountId, error: moveError(result.error) })
        }
      } catch (error) {
        if (activeMoveOperationRef.current !== operationId) return
        activeMoveOperationRef.current = ''
        dispatch({
          type: 'move.failed',
          accountId,
          error: errorMessage(error, 'Could not move the account. Try again.')
        })
      }
    },
    onSearchChange: (query: string) => {
      clearTimeout(accountSearchTimeoutRef.current)
      accountSearchTimeoutRef.current = setTimeout(() => dispatch({ type: 'search.changed', query }), 80)
    },
    onSearchClear: () => {
      clearTimeout(accountSearchTimeoutRef.current)
      if (accountSearchInputRef.current) accountSearchInputRef.current.value = ''
      dispatch({ type: 'search.changed', query: '' })
    }
  }

  return {
    accountSearchInputRef,
    closeAddAccount: () => dispatch({ type: 'panel.list-opened' }),
    events,
    state
  }
}
