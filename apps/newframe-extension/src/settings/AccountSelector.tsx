import type { ExtensionAccounts } from '@newframe/schema/local-api'
import { Button } from '@newframe/ui/button'
import { Icon } from '@newframe/ui/icon'
import { Selection } from '@newframe/ui/selection'
import { Stack } from '@newframe/ui/stack'
import { Text } from '@newframe/ui/text'
import { useState } from 'react'

export type AccountSelectorProps = {
  extensionAccounts: ExtensionAccounts
  onRequestAccounts: () => void
  onSelect: (address: string) => void
}

const shortAddress = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`

function AccessFooter({ all, onRequestAccounts }: { all: boolean; onRequestAccounts: () => void }) {
  if (all) {
    return (
      <Text align='center' tone='muted' variant='caption'>
        All accounts in this profile are shared
      </Text>
    )
  }
  return (
    <Button appearance='subtle' onPress={onRequestAccounts} size='compact' width='full'>
      Request more accounts
    </Button>
  )
}

export function AccountSelector({ extensionAccounts, onRequestAccounts, onSelect }: AccountSelectorProps) {
  const [open, setOpen] = useState(false)
  const { accounts, selected } = extensionAccounts
  const selectedAccount = accounts.find((account) => account.address === selected)

  return (
    <Selection
      footer={
        <AccessFooter
          all={extensionAccounts.all === true}
          onRequestAccounts={() => {
            setOpen(false)
            onRequestAccounts()
          }}
        />
      }
      items={accounts.map((account) => ({
        content: (
          <>
            <Icon name='check' size='small' tone='accent' visible={account.address === selected} />
            <Stack gap='none' grow>
              <Text truncate variant='label'>
                {account.name}
              </Text>
              <Text tone='muted' variant='microCode'>
                {shortAddress(account.address)}
              </Text>
            </Stack>
          </>
        ),
        id: account.address
      }))}
      label='Account'
      menuAlign='end'
      menuWidth='wide'
      onOpenChange={setOpen}
      onSelect={onSelect}
      open={open}
      placeholder={!selectedAccount}
      reserveMenuSpace
      selectedId={selectedAccount?.address}
      trigger={
        <Stack gap='none' grow>
          <Text display='inline' truncate variant='label'>
            {selectedAccount?.name ?? 'Choose account'}
          </Text>
          {selectedAccount ? (
            <Text tone='muted' variant='microCode'>
              {shortAddress(selectedAccount.address)}
            </Text>
          ) : null}
        </Stack>
      }
      triggerSize='medium'
    />
  )
}
