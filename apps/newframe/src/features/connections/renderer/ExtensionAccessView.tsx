import { Button } from '@newframe/ui/button'
import { Dialog } from '@newframe/ui/dialog'
import { Inline } from '@newframe/ui/inline'
import { ScrollArea } from '@newframe/ui/scroll-area'
import { Stack } from '@newframe/ui/stack'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'
import { ToggleButton } from '@newframe/ui/toggle-button'
import { useState } from 'react'

import { AddressAvatar } from '../../../shared/renderer/ui/AddressAvatar.tsx'
import { shortAddress } from '../../../shared/renderer/ui/AddressIdentity.tsx'

interface ExtensionAccessAccount {
  id: string
  address: string
  name: string
  accountType?: string
}

interface ExtensionAccessGrant {
  all: boolean
  accountIds: string[]
}

export function ExtensionAccessView({
  accounts,
  initial,
  onCancel,
  onSave
}: {
  accounts: readonly ExtensionAccessAccount[]
  initial: ExtensionAccessGrant
  onCancel: () => void
  onSave: (grant: ExtensionAccessGrant) => void
}) {
  const [all, setAll] = useState(initial.all)
  const [accountIds, setAccountIds] = useState(initial.accountIds)
  const toggle = (id: string) =>
    setAccountIds((ids) => (ids.includes(id) ? ids.filter((candidate) => candidate !== id) : [...ids, id]))

  return (
    <Dialog label='Extension account access' onDismiss={onCancel} padding='large' width='compact'>
      <Stack gap='medium'>
        <Stack gap='xsmall'>
          <Text align='center' variant='title'>
            Extension account access
          </Text>
          <Text align='center' tone='secondary' variant='supporting'>
            Newframe Companion can only see and use the accounts you share from this profile.
          </Text>
        </Stack>
        <Surface padding='small' radius='control' tone='raised'>
          <Inline align='center' gap='small' justify='between'>
            <Stack gap='none' grow>
              <Text variant='label'>All accounts</Text>
              <Text tone='muted' variant='caption'>
                Share every account in whichever profile is active
              </Text>
            </Stack>
            <ToggleButton
              appearance='switch'
              label='Share all accounts'
              onPress={() => setAll((value) => !value)}
              pressed={all}
            />
          </Inline>
        </Surface>
        <ScrollArea height='menu'>
          <Stack gap='xsmall'>
            {accounts.map((account) => {
              const selected = all || accountIds.includes(account.id)
              return (
                <Button
                  appearance={selected ? 'subtle' : 'row'}
                  disabled={all}
                  key={account.id}
                  label={`Share ${account.name} (${account.address})`}
                  onPress={() => toggle(account.id)}
                  pressed={selected}
                  size='small'
                  width='full'
                >
                  <Text tone={selected ? 'accent' : 'secondary'}>{selected ? '✓' : '○'}</Text>
                  <AddressAvatar address={account.address} accountType={account.accountType} />
                  <Stack gap='none' grow>
                    <Text truncate variant='caption'>
                      {account.name}
                    </Text>
                    <Text tone='muted' truncate variant='micro'>
                      {shortAddress(account.address)}
                    </Text>
                  </Stack>
                </Button>
              )
            })}
          </Stack>
        </ScrollArea>
        <Stack direction='row' equal gap='small'>
          <Button appearance='ghost' onPress={onCancel} shape='pill'>
            <Text variant='action'>Cancel</Text>
          </Button>
          <Button appearance='primary' onPress={() => onSave({ all, accountIds })} shape='pill'>
            <Text variant='action'>Save</Text>
          </Button>
        </Stack>
      </Stack>
    </Dialog>
  )
}
