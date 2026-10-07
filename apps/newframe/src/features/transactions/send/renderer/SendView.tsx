import { Button } from '@newframe/ui/button'
import { Icon } from '@newframe/ui/icon'
import { IconButton } from '@newframe/ui/icon-button'
import { Input } from '@newframe/ui/input'
import { ScrollArea } from '@newframe/ui/scroll-area'
import { Stack } from '@newframe/ui/stack'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'

import { useAddressName } from '../../../../shared/renderer/addressNames.tsx'
import { AddressIdentity, shortAddress } from '../../../../shared/renderer/ui/AddressIdentity.tsx'
import { CopyButton } from '../../../../shared/renderer/ui/CopyButton.tsx'
import { SidePanel } from '../../../../shared/renderer/ui/SidePanel/SidePanel.tsx'
import TokenSelector from '../../../../shared/renderer/ui/TokenSelector.tsx'
import { SEND_TOKEN_ROWS_INCREMENT } from './sendReducer.ts'
import type { SendCapability } from './sendService.ts'
import type { SendAccountViewModel, SendViewEvents, SendViewModel } from './sendViewModel.ts'

function RecipientSectionTitle({ icon, title }: { icon: 'accounts' | 'wallet'; title: string }) {
  return (
    <Surface padding='small' radius='none' tone='transparent'>
      <Stack align='center' direction='row' gap='small'>
        <Icon name={icon} size='small' />
        <Text variant='label' tone='secondary'>
          {title}
        </Text>
      </Stack>
    </Surface>
  )
}

function RecipientOption({
  capability,
  onSelect,
  recipient
}: {
  capability: Pick<SendCapability, 'writeText'>
  onSelect: (recipient: SendAccountViewModel) => void
  recipient: SendAccountViewModel
}) {
  const name = useAddressName(recipient.address)?.name ?? shortAddress(recipient.address)
  return (
    <Stack align='center' direction='row' gap='small'>
      <Stack grow>
        <Button
          appearance='row'
          label={`Select ${name}`}
          onPress={() => onSelect(recipient)}
          size='list'
          width='full'
        >
          <AddressIdentity address={recipient.address} showCopy={false} />
        </Button>
      </Stack>
      <CopyButton
        clipboard={capability}
        copiedLabel={`Address copied for ${shortAddress(recipient.address)}`}
        copiedTitle='Address copied'
        label={`Copy address for ${shortAddress(recipient.address)}`}
        title='Copy address'
        value={recipient.address}
      />
    </Stack>
  )
}

export function SendView({
  capability,
  events,
  model
}: {
  capability: Pick<SendCapability, 'hydrateTokenImage' | 'writeText'>
  events: SendViewEvents
  model: SendViewModel
}) {
  const asset = model.selectedAsset

  return (
    <SidePanel
      closeLabel='Close Send'
      footer={
        asset ? (
          <Stack grow>
            <Button
              appearance='primary'
              disabled={!model.validation.proceedEnabled}
              onPress={events.onSubmit}
              shape='pill'
              size='large'
            >
              <Text align='center' variant='action' tone='inverse'>
                Proceed
              </Text>
            </Button>
          </Stack>
        ) : undefined
      }
      footerCompact
      onClose={events.onClose}
      title='Send'
    >
      {asset ? (
        <Stack gap='medium'>
          <Surface padding='large' radius='control' tone='card'>
            <Stack gap='medium'>
              <Text variant='sectionTitle' tone='secondary'>
                Add recipient
              </Text>
              {model.recipient ? (
                <Stack gap='small'>
                  <Surface border='accent' padding='small' radius='control' tone='raised'>
                    <Stack align='center' direction='row' gap='medium' justify='between'>
                      <AddressIdentity address={model.recipient.address} clipboard={capability} />
                      <IconButton
                        icon='close'
                        label='Clear recipient'
                        onPress={events.onClearRecipient}
                        size='small'
                      />
                    </Stack>
                  </Surface>
                  {model.firstTimeRecipient ? (
                    <Text variant='body' tone='warning'>
                      First time sending to this address.
                    </Text>
                  ) : null}
                </Stack>
              ) : (
                <Stack gap='medium'>
                  <Surface padding='small' radius='control' tone='raised'>
                    <Stack align='center' direction='row' gap='small'>
                      <Stack grow>
                        <Input
                          appearance='plain'
                          label='Recipient'
                          onValueChange={events.onRecipientInputChange}
                          placeholder='Address / gns/ens name / Namoshi'
                          spellCheck={false}
                          value={model.recipientInput}
                        />
                      </Stack>
                      <IconButton
                        expanded={model.recipientOpen}
                        icon='chevronUp'
                        label='Toggle recipients'
                        onPress={events.onToggleRecipients}
                        size='small'
                      />
                    </Stack>
                  </Surface>
                  {model.recipientOpen ? (
                    <Surface elevation='default' padding='none' radius='control' tone='control'>
                      <ScrollArea height='menu'>
                        <Stack gap='none'>
                          <RecipientSectionTitle icon='wallet' title='My wallets' />
                          {model.recipientAccounts.map((account) => (
                            <RecipientOption
                              capability={capability}
                              key={account.id}
                              onSelect={events.onSelectRecipient}
                              recipient={account}
                            />
                          ))}
                        </Stack>
                      </ScrollArea>
                    </Surface>
                  ) : null}
                </Stack>
              )}
            </Stack>
          </Surface>
          <Surface padding='large' radius='control' tone='card'>
            <Stack gap='large'>
              <Text variant='sectionTitle' tone='secondary'>
                Send token
              </Text>
              <Stack align='center' direction='row' gap='large' justify='between'>
                <TokenSelector
                  ariaLabel='Select send token'
                  imageCapability={capability}
                  pagination={{
                    increment: SEND_TOKEN_ROWS_INCREMENT,
                    onShowMore: events.onShowMoreTokens,
                    rowsHidden: model.rowsHidden
                  }}
                  items={model.tokenItems}
                  searchableItems={model.searchableTokenItems}
                  chains={model.chains}
                  chainsMeta={model.chainsMeta}
                  onOpenChange={events.onTokenPickerOpenChange}
                  onSelect={events.onSelectAsset}
                  open={model.tokenOpen}
                  selectedId={model.selectedAssetKey}
                />
                <Stack grow>
                  <Input
                    align='end'
                    appearance='amount'
                    label='Amount'
                    inputMode='decimal'
                    onValueChange={events.onAmountChange}
                    spellCheck={false}
                    value={model.amount}
                  />
                </Stack>
              </Stack>
              <Stack align='center' direction='row' gap='small' justify='between'>
                <Stack align='center' direction='row' gap='small' grow>
                  <Icon name='wallet' size='small' />
                  <Text variant='body' tone='secondary' truncate>
                    {asset.displayBalance || '0'} {asset.symbol || ''}
                  </Text>
                  <Button appearance='subtle' onPress={events.onSetMax} shape='pill' size='compact'>
                    <Text display='inline' variant='caption' tone='accent'>
                      Max
                    </Text>
                  </Button>
                </Stack>
                <Text variant='numeric' tone='secondary'>
                  {model.fiatValue}
                </Text>
              </Stack>
            </Stack>
          </Surface>
          {model.validation.error || model.submission.error ? (
            <Text align='center' variant='body' tone='danger'>
              {model.validation.error || model.submission.error}
            </Text>
          ) : null}
          {model.submission.status ? (
            <Text align='center' variant='body' tone='secondary'>
              {model.submission.status}
            </Text>
          ) : null}
        </Stack>
      ) : (
        <Stack align='center' grow justify='center'>
          <Text tone='secondary'>No assets available to send.</Text>
        </Stack>
      )}
    </SidePanel>
  )
}
