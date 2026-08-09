import type { DragEvent, ReactNode, RefObject } from 'react'

import { Button } from '@newframe/ui/button'
import { Field } from '@newframe/ui/field'
import { Heading } from '@newframe/ui/heading'
import { Icon } from '@newframe/ui/icon'
import { IconButton } from '@newframe/ui/icon-button'
import { Inline } from '@newframe/ui/inline'
import { Input } from '@newframe/ui/input'
import { ScrollArea } from '@newframe/ui/scroll-area'
import { SearchField } from '@newframe/ui/search-field'
import { Selection, type SelectionItem } from '@newframe/ui/selection'
import { Spinner } from '@newframe/ui/spinner'
import { Stack } from '@newframe/ui/stack'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'

import { cva } from '../../../../generated/styled-system/css/cva.js'
import { HeaderBar } from '../../../shared/renderer/ui/HeaderBar'
import { SidePanelHeader } from '../../../shared/renderer/ui/SidePanel/SidePanelHeader'
import { signerIconName } from '../../../shared/renderer/ui/signerPresentation'
import AccountRenameInput from './AccountRenameInput'
import type { AccountListItem, AccountListModel } from './accountsModel'
import type { AccountsState } from './accountsReducer'

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
  base: {
    display: 'flex',
    flex: 'none',
    alignItems: 'center',
    gap: '4',
    padding: '4',
    '& > :first-child': { flex: '1 1 0', minWidth: 0 }
  }
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

interface AccountsViewEvents {
  onAccountAgentAccessChange: (account: AccountListItem, enabled: boolean) => void
  onAccountAgentSessionsRevoke: (accountId: string) => void
  onAccountCopy: (account: AccountListItem) => void
  onAccountDragEnd: () => void
  onAccountDragOver: (event: DragEvent, accountId: string) => void
  onAccountDragStart: (event: DragEvent, accountId: string) => void
  onAccountDrop: (event: DragEvent, accountId: string) => void
  onAccountExportOpen: (accountId: string) => void
  onAccountMenuToggle: (accountId: string) => void
  onAccountRemove: (accountId: string, removeSeedPhrase: boolean) => void
  onAccountRemoveCancel: () => void
  onAccountRemoveOpen: (accountId: string) => void
  onAccountRenameCancel: () => void
  onAccountRenameCommit: (accountId: string, name: string) => void
  onAccountRenameOpen: (accountId: string) => void
  onAccountSelect: (accountId: string) => void
  onAddAccountOpen: () => void
  onClose: () => void
  onExportClose: () => void
  onExportCopy: () => void
  onExportPasswordChange: (password: string) => void
  onExportRevealToggle: () => void
  onExportUnlock: () => void
  onMoveOpenChange: (accountId: string, open: boolean) => void
  onMoveSelect: (accountId: string, profileId: string) => void
  onSearchChange: (query: string) => void
  onSearchClear: () => void
}

export interface AccountsViewProps extends AccountsViewEvents {
  accountSearchInputRef: RefObject<HTMLInputElement | null>
  addAccountView: ReactNode
  model: AccountListModel
  profileSelector: ReactNode
  state: AccountsState
}

function PrivateKeyExportView({
  account,
  state,
  ...events
}: {
  account: AccountListItem
  state: AccountsState['export']
  onClose: () => void
  onCopy: () => void
  onPasswordChange: (password: string) => void
  onRevealToggle: () => void
  onUnlock: () => void
}) {
  const hasSecret = Boolean(state.secret)
  const keyText = hasSecret
    ? state.secret
    : '0x0000000000000000000000000000000000000000000000000000000000000000'
  return (
    <Stack grow gap='none'>
      <SidePanelHeader closeLabel='Back to accounts' onClose={events.onClose} title='Private key export' />
      <Surface padding='medium' radius='none' tone='transparent'>
        <Stack gap='medium'>
          {!hasSecret ? (
            <Field label='Newframe password' vertical>
              <Input
                autoFocus
                label='Private key export password'
                placeholder='Enter password'
                type='password'
                value={state.password}
                onValueChange={events.onPasswordChange}
                onSubmit={events.onUnlock}
              />
            </Field>
          ) : null}
          <div className={secretRecipe({ revealed: hasSecret && state.revealed })}>
            <Text variant='code'>{keyText}</Text>
          </div>
          {state.error ? <Text tone='danger'>{state.error}</Text> : null}
          <Inline align='center' gap='small'>
            {hasSecret ? (
              <Button appearance='primary' onPress={events.onCopy} size='medium'>
                <Icon name={state.copied ? 'check' : 'copy'} size='small' />
                <Text variant='compactAction'>{state.copied ? 'Copied' : 'Copy key'}</Text>
              </Button>
            ) : (
              <Button appearance='primary' disabled={state.loading} onPress={events.onUnlock} size='medium'>
                {state.loading ? <Spinner label='Unlocking' size='small' /> : null}
                <Text variant='compactAction'>
                  {state.loading ? 'Unlocking' : `Unlock ${account.displayName}`}
                </Text>
              </Button>
            )}
            {hasSecret ? (
              <Button appearance='control' onPress={events.onRevealToggle} size='medium'>
                <Icon name='eye' size='small' />
                <Text variant='compactAction'>{state.revealed ? 'Hide key' : 'Reveal key'}</Text>
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

function AccountActions({
  account,
  model,
  state,
  ...events
}: {
  account: AccountListItem
  model: AccountListModel
  state: AccountsState
  onAgentAccessChange: (enabled: boolean) => void
  onAgentSessionsRevoke: () => void
  onExportOpen: () => void
  onMoveOpenChange: (open: boolean) => void
  onMoveSelect: (profileId: string) => void
  onRemove: (removeSeedPhrase: boolean) => void
  onRemoveCancel: () => void
  onRemoveOpen: () => void
  onRenameOpen: () => void
}) {
  const moveOpen = state.move.kind !== 'closed' && state.move.accountId === account.id
  const moveError =
    state.move.kind === 'failed' && state.move.accountId === account.id ? state.move.error : ''
  const otherProfiles = model.profiles.filter((profile) => profile.id !== account.profileId)
  const confirmingRemove = state.removingAccountId === account.id
  return (
    <div className={actionsMenuRecipe()} onClick={(event) => event.stopPropagation()}>
      <Stack gap='xsmall'>
        <Button appearance='row' onPress={events.onRenameOpen} size='small' width='full'>
          <Text variant='caption'>Rename account</Text>
        </Button>
        {otherProfiles.length ? (
          <Selection
            items={otherProfiles.map(
              (profile): SelectionItem => ({
                id: profile.id,
                content: (
                  <Stack gap='none' grow>
                    <Text variant='caption' truncate>
                      {profile.name}
                    </Text>
                    <Text tone='muted' variant='micro'>
                      {profile.accountCount} {profile.accountCount === 1 ? 'Account' : 'Accounts'}
                    </Text>
                  </Stack>
                )
              })
            )}
            label={`Move ${account.displayName} to profile`}
            onOpenChange={events.onMoveOpenChange}
            onSelect={events.onMoveSelect}
            open={moveOpen}
            trigger={<Text variant='caption'>Move to profile</Text>}
            triggerSize='small'
          />
        ) : null}
        {moveError ? (
          <Text tone='danger' variant='caption'>
            {moveError}
          </Text>
        ) : null}
        {account.hot || account.agentEnabled ? (
          <>
            <Button
              appearance='row'
              onPress={() => events.onAgentAccessChange(!account.agentEnabled)}
              size='small'
              width='full'
            >
              <Text variant='caption'>{account.agentEnabled ? 'Disable AI access' : 'Enable AI access'}</Text>
            </Button>
            {account.agentEnabled ? (
              <Button appearance='row' onPress={events.onAgentSessionsRevoke} size='small' width='full'>
                <Text variant='caption'>Revoke AI sessions</Text>
              </Button>
            ) : null}
            {account.hot ? (
              <Button appearance='row' onPress={events.onExportOpen} size='small' width='full'>
                <Text variant='caption'>Export private key</Text>
              </Button>
            ) : null}
          </>
        ) : null}
        {confirmingRemove && account.lastSeedAccount ? (
          <Stack gap='xsmall'>
            <Text variant='caption'>This is the last account using this seed phrase.</Text>
            <Button appearance='control' onPress={() => events.onRemove(false)} size='small'>
              <Text variant='caption'>Keep seed phrase</Text>
            </Button>
            <Button appearance='danger' onPress={() => events.onRemove(true)} size='small'>
              <Text variant='caption'>Delete seed phrase</Text>
            </Button>
            <Button appearance='ghost' onPress={events.onRemoveCancel} size='small'>
              <Text variant='caption'>Cancel</Text>
            </Button>
          </Stack>
        ) : confirmingRemove ? (
          <Button appearance='danger' onPress={() => events.onRemove(false)} size='small'>
            <Text variant='caption'>Confirm remove</Text>
          </Button>
        ) : (
          <Button appearance='danger' onPress={events.onRemoveOpen} size='small'>
            <Text variant='caption'>Remove account</Text>
          </Button>
        )}
      </Stack>
    </div>
  )
}

export function AccountsView(props: AccountsViewProps) {
  const { model, state } = props
  const exportedAccountId = state.panel.kind === 'export' ? state.panel.accountId : ''
  const exportedAccount = exportedAccountId
    ? model.items.find((item) => item.id === exportedAccountId)
    : undefined
  return (
    <div aria-label='Accounts' className={overlayRecipe()} role='dialog'>
      {state.panel.kind !== 'export' ? (
        <HeaderBar>
          <Heading level={1} variant='title'>
            Accounts
          </Heading>
          {props.profileSelector}
          <IconButton icon='close' label='Close accounts' onPress={props.onClose} />
        </HeaderBar>
      ) : null}
      {state.panel.kind === 'export' && exportedAccount ? (
        <ScrollArea height='fill'>
          <PrivateKeyExportView
            account={exportedAccount}
            state={state.export}
            onClose={props.onExportClose}
            onCopy={props.onExportCopy}
            onPasswordChange={props.onExportPasswordChange}
            onRevealToggle={props.onExportRevealToggle}
            onUnlock={props.onExportUnlock}
          />
        </ScrollArea>
      ) : state.panel.kind === 'add' ? (
        props.addAccountView
      ) : (
        <>
          <div className={toolsRecipe()}>
            <SearchField
              inputRef={props.accountSearchInputRef}
              label='Search accounts'
              onChange={props.onSearchChange}
              onClear={props.onSearchClear}
              placeholder='Search accounts'
              value={state.query}
            />
            <Button
              appearance='control'
              label='Add account'
              onPress={props.onAddAccountOpen}
              shape='pill'
              size='small'
            >
              <Icon name='plus' size='small' />
              <Text variant='compactAction'>Add account</Text>
            </Button>
          </div>
          <ScrollArea height='fill'>
            <Surface padding='small' radius='none' tone='transparent'>
              <Stack gap='small'>
                {model.items.map((account) => {
                  const selected = account.id === model.currentAccountId
                  const renaming = state.renamingAccountId === account.id
                  const menuOpen = state.menuAccountId === account.id
                  return (
                    <div
                      aria-current={selected ? 'true' : undefined}
                      aria-label={`${account.displayName} ${account.shortAddress}`}
                      key={account.id}
                      className={accountRowRecipe({
                        dragging: state.drag.accountId === account.id,
                        dropTarget: state.drag.overAccountId === account.id,
                        selected
                      })}
                      onDragOver={(event) => props.onAccountDragOver(event, account.id)}
                      onDrop={(event) => props.onAccountDrop(event, account.id)}
                      onClick={() => props.onAccountSelect(account.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          props.onAccountSelect(account.id)
                        }
                      }}
                      role='button'
                      tabIndex={0}
                    >
                      <span
                        aria-label={`Drag ${account.displayName} to reorder`}
                        draggable
                        onClick={(event) => event.stopPropagation()}
                        onDragEnd={props.onAccountDragEnd}
                        onDragStart={(event) => props.onAccountDragStart(event, account.id)}
                        title='Drag to reorder'
                      >
                        <Icon name='ellipsis' size='small' tone='muted' />
                      </span>
                      <span className={accountIconRecipe()}>
                        <Icon name={signerIconName(account.signerType)} size='large' />
                      </span>
                      <Stack gap='none' grow>
                        {renaming ? (
                          <AccountRenameInput
                            ariaLabel={`Rename ${account.displayName}`}
                            initialName={account.displayName}
                            onCancel={props.onAccountRenameCancel}
                            onCommit={(name) => props.onAccountRenameCommit(account.id, name)}
                          />
                        ) : (
                          <Inline align='center' gap='xsmall'>
                            <Text variant='label' truncate>
                              {account.displayName}
                            </Text>
                            <IconButton
                              appearance='ghost'
                              icon='edit'
                              label={`Rename ${account.displayName}`}
                              onPress={(event) => {
                                event.stopPropagation()
                                props.onAccountRenameOpen(account.id)
                              }}
                              size='small'
                            />
                          </Inline>
                        )}
                        <Text tone='muted' variant='code'>
                          {account.shortAddress}
                        </Text>
                        <Inline align='center' gap='xsmall'>
                          <Text tone='accent' variant='micro'>
                            {account.signerLabel}
                          </Text>
                          {account.agentEnabled ? (
                            <Text tone='accent' variant='micro'>
                              · AI Wallet
                            </Text>
                          ) : null}
                        </Inline>
                      </Stack>
                      <Text align='end' variant='numeric' shrink={false}>
                        {account.balanceLabel}
                      </Text>
                      <IconButton
                        appearance='ghost'
                        icon={state.copiedAccountId === account.id ? 'check' : 'copy'}
                        label={`Copy address for ${account.displayName}`}
                        onPress={(event) => {
                          event.stopPropagation()
                          props.onAccountCopy(account)
                        }}
                        size='small'
                      />
                      <IconButton
                        appearance='ghost'
                        expanded={menuOpen}
                        icon='ellipsis'
                        label={`${account.displayName} account actions`}
                        onPress={(event) => {
                          event.stopPropagation()
                          props.onAccountMenuToggle(account.id)
                        }}
                        size='small'
                      />
                      {menuOpen ? (
                        <AccountActions
                          account={account}
                          model={model}
                          state={state}
                          onAgentAccessChange={(enabled) =>
                            props.onAccountAgentAccessChange(account, enabled)
                          }
                          onAgentSessionsRevoke={() => props.onAccountAgentSessionsRevoke(account.id)}
                          onExportOpen={() => props.onAccountExportOpen(account.id)}
                          onMoveOpenChange={(open) => props.onMoveOpenChange(account.id, open)}
                          onMoveSelect={(profileId) => props.onMoveSelect(account.id, profileId)}
                          onRemove={(removeSeed) => props.onAccountRemove(account.id, removeSeed)}
                          onRemoveCancel={props.onAccountRemoveCancel}
                          onRemoveOpen={() => props.onAccountRemoveOpen(account.id)}
                          onRenameOpen={() => props.onAccountRenameOpen(account.id)}
                        />
                      ) : null}
                    </div>
                  )
                })}
                {model.items.length === 0 ? (
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
