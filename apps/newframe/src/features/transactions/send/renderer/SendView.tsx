import { Button } from '@newframe/ui/button'
import { Icon } from '@newframe/ui/icon'
import { IconButton } from '@newframe/ui/icon-button'
import { Input } from '@newframe/ui/input'
import { ScrollArea } from '@newframe/ui/scroll-area'
import { Stack } from '@newframe/ui/stack'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'

import TokenSelector from '../../../../shared/renderer/ui/TokenSelector'
import { SidePanel } from '../../../../shared/renderer/ui/SidePanel/SidePanel'
import { AddressIdentity } from '../../../../shared/renderer/ui/AddressIdentity'
import { CopyButton } from '../../../../shared/renderer/ui/CopyButton'
import AccountIcon from './AccountIcon'
import { SEND_TOKEN_ROWS_INCREMENT } from './sendReducer'
import type { SendAccountViewModel, SendViewEvents, SendViewModel } from './sendViewModel'
import type { SendCapability } from './sendService'

function recipientName(account: SendAccountViewModel) {
  return account.ensName || account.name || account.address
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
                      <AccountIcon account={model.recipient} />
                      <AddressIdentity
                        address={model.recipient.address}
                        clipboard={capability}
                        nickname={recipientName(model.recipient)}
                      />
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
                          <Surface padding='small' radius='none' tone='transparent'>
                            <Stack align='center' direction='row' gap='small'>
                              <Icon name='wallet' size='small' />
                              <Text variant='label' tone='secondary'>
                                My wallets
                              </Text>
                            </Stack>
                          </Surface>
                          {model.recipientAccounts.map((account) => (
                            <Stack align='center' direction='row' gap='small' key={account.id}>
                              <Stack grow>
                                <Button
                                  appearance='row'
                                  label={`Select ${recipientName(account)}`}
                                  onPress={() => events.onSelectRecipient(account)}
                                  size='list'
                                  width='full'
                                >
                                  <AccountIcon account={account} />
                                  <Text variant='heading' truncate>
                                    {recipientName(account)}
                                  </Text>
                                  <AddressIdentity address={account.address} showCopy={false} />
                                </Button>
                              </Stack>
                              <CopyButton
                                clipboard={capability}
                                copiedLabel={`Address copied for ${account.address.slice(0, 8)}...${account.address.slice(-6)}`}
                                copiedTitle='Address copied'
                                label={`Copy address for ${account.address.slice(0, 8)}...${account.address.slice(-6)}`}
                                title='Copy address'
                                value={account.address}
                              />
                            </Stack>
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
                  footer={
                    model.rowsHidden > 0 ? (
                      <Stack>
                        <Button onPress={events.onShowMoreTokens}>
                          <Text align='center' variant='supporting' tone='secondary'>{`Show ${Math.min(
                            SEND_TOKEN_ROWS_INCREMENT,
                            model.rowsHidden
                          )} more assets`}</Text>
                        </Button>
                      </Stack>
                    ) : null
                  }
                  items={model.tokenItems}
                  searchableItems={model.searchableTokenItems}
                  networks={model.networks}
                  networksMeta={model.networksMeta}
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
