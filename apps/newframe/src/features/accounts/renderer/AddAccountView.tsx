import { Button } from '@newframe/ui/button'
import { Field } from '@newframe/ui/field'
import { Grid } from '@newframe/ui/grid'
import { Icon, type IconName } from '@newframe/ui/icon'
import { Inline } from '@newframe/ui/inline'
import { Input } from '@newframe/ui/input'
import { ScrollArea } from '@newframe/ui/scroll-area'
import { Spinner } from '@newframe/ui/spinner'
import { Stack } from '@newframe/ui/stack'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'
import { TextArea } from '@newframe/ui/text-area'
import { ToggleButton } from '@newframe/ui/toggle-button'

import { AppIcon } from '../../../shared/renderer/ui/appIcon'
import { SidePanelHeader } from '../../../shared/renderer/ui/SidePanel/SidePanelHeader'
import { signerIconName } from '../../../shared/renderer/ui/signerPresentation'

export type AddAccountOption = { id: string; title: string; icon: IconName | 'file' }

export interface AddAccountAddressRowModel {
  address: string
  chains: string[]
  imported: boolean
  index: number
  label: string
  shortAddress: string
  usage: 'loading' | 'used' | 'unused' | 'unavailable' | 'value'
  value?: string
}

interface AddAccountImportModel {
  accountType: string
  error: string
  input: string
  keystorePassword: string
  keystoreSelected: boolean
  name: string
  needsFramePassword: boolean
  password: string
  passwordLabel: string
  status: string
}

type StoredSeedModel =
  | { mode: 'empty' }
  | {
      mode: 'seeds'
      seeds: Array<{
        expanded: boolean
        id: string
        importedCount: number
        label: string
        totalCount: number
        wallets: Array<{ address: string; name: string; shortAddress: string }>
      }>
    }
  | { mode: 'addresses'; error: string; rows: AddAccountAddressRowModel[]; status: string }

interface GeneratedSeedModel {
  backedUp: boolean
  copied: boolean
  error: string
  name: string
  needsFramePassword: boolean
  password: string
  passwordLabel: string
  status: string
  words: string[]
}

type HardwareInputModel =
  | { kind: 'none' }
  | { kind: 'pin'; length: number }
  | { kind: 'passphrase'; allowsDeviceEntry: boolean; value: string }
  | { kind: 'pair'; value: string }

interface HardwarePaginationModel {
  input: string
  maxPage: number
  page: number
}

type HardwareModel =
  | {
      mode: 'list'
      deviceId: string
      deviceName: string
      error: string
      signers: Array<{ addressCount: number; id: string; name: string; status: string; type: string }>
      status: string
      title: string
      type: string
    }
  | {
      mode: 'details'
      emptyText: string
      error: string
      input: HardwareInputModel
      pagination: HardwarePaginationModel | null
      rows: AddAccountAddressRowModel[]
      signer: { id: string; loading: boolean; name: string; status: string; type: string }
      status: string
      title: string
    }

export type AddAccountFlowModel =
  | { kind: 'methods'; options: AddAccountOption[]; selected: string }
  | { kind: 'import'; model: AddAccountImportModel }
  | { kind: 'stored-seed'; model: StoredSeedModel }
  | { kind: 'generated-seed'; model: GeneratedSeedModel }
  | { kind: 'hardware'; model: HardwareModel }

export interface AddAccountViewEvents {
  onBack: () => void
  onCategorySelect: (id: string) => void
  onCreateGeneratedSeed: () => void
  onCreateLattice: () => void
  onCreateSeedOpen: () => void
  onGeneratedSeedBackupToggle: () => void
  onGeneratedSeedCopy: () => void
  onGeneratedSeedRegenerate: () => void
  onHardwareAddressSelect: (address: string) => void
  onHardwarePair: () => void
  onHardwarePairCodeChange: (value: string) => void
  onHardwarePassphraseChange: (value: string) => void
  onHardwarePinAppend: (digit: number) => void
  onHardwarePinDelete: () => void
  onHardwareReload: () => void
  onHardwareRemove: () => void
  onHardwareSelect: (signerId: string) => void
  onHardwareSubmit: (input: 'pin' | 'passphrase' | 'device-passphrase') => void
  onImportSeedOpen: () => void
  onInputChange: (value: string) => void
  onKeystoreLocate: () => void
  onKeystorePasswordChange: (value: string) => void
  onLatticeNameChange: (value: string) => void
  onNameChange: (value: string) => void
  onPageChange: (page: number) => void
  onPageInputChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onStoredSeedAddressSelect: (address: string) => void
  onStoredSeedExpand: (signerId: string) => void
  onStoredSeedSelect: (signerId: string) => void
  onSubmitImport: () => void
  onTypeSelect: (id: string) => void
}

function Feedback({ error, status }: { error: string; status: string }) {
  return (
    <>
      {error ? (
        <Text tone='danger' variant='supporting'>
          {error}
        </Text>
      ) : null}
      {status ? (
        <Text tone='accent' variant='supporting'>
          {status}
        </Text>
      ) : null}
    </>
  )
}

function MethodView({
  events,
  flow
}: {
  events: AddAccountViewEvents
  flow: Extract<AddAccountFlowModel, { kind: 'methods' }>
}) {
  return (
    <Stack gap='small'>
      {flow.options.map((option) => (
        <Button
          appearance='outlinedSelection'
          key={option.id}
          label={option.title}
          onPress={() =>
            flow.options.length === 3 ? events.onTypeSelect(option.id) : events.onCategorySelect(option.id)
          }
          selected={flow.selected === option.id}
          size='list'
          width='full'
        >
          {option.icon === 'file' ? (
            <AppIcon name='file' size={16} />
          ) : (
            <Icon name={option.icon} size='medium' />
          )}
          <Text variant='label'>{option.title}</Text>
        </Button>
      ))}
    </Stack>
  )
}

function AddAccountImportView({
  events,
  model
}: {
  events: AddAccountViewEvents
  model: AddAccountImportModel
}) {
  const inputLabel =
    model.accountType === 'watch'
      ? 'Address or gns/ens name'
      : model.accountType === 'seed'
        ? 'Recovery phrase'
        : 'Private key'
  return (
    <Stack gap='small'>
      {model.accountType !== 'keystore' ? (
        <Field label={inputLabel} vertical>
          {model.accountType === 'seed' ? (
            <TextArea
              label={inputLabel}
              spellCheck={false}
              value={model.input}
              onValueChange={events.onInputChange}
            />
          ) : (
            <Input
              label={inputLabel}
              spellCheck={false}
              value={model.input}
              onValueChange={events.onInputChange}
              onSubmit={events.onSubmitImport}
            />
          )}
        </Field>
      ) : (
        <Button
          appearance='outlinedSelection'
          label='Choose JSON backup file'
          onPress={events.onKeystoreLocate}
          selected={model.keystoreSelected}
          size='list'
          width='full'
        >
          <AppIcon name='file' size={14} />
          <Text variant='label'>
            {model.keystoreSelected ? 'JSON backup file selected' : 'Choose JSON backup file'}
          </Text>
        </Button>
      )}
      {model.accountType === 'keystore' ? (
        <Field label='JSON backup file password' vertical>
          <Input
            label='JSON backup file password'
            spellCheck={false}
            type='password'
            value={model.keystorePassword}
            onValueChange={events.onKeystorePasswordChange}
          />
        </Field>
      ) : null}
      <Field label='Account name' vertical>
        <Input
          label='Account name'
          spellCheck={false}
          value={model.name}
          onValueChange={events.onNameChange}
        />
      </Field>
      {model.needsFramePassword ? (
        <Field label={model.passwordLabel} vertical>
          <Input
            label={model.passwordLabel}
            spellCheck={false}
            type='password'
            value={model.password}
            onValueChange={events.onPasswordChange}
            onSubmit={events.onSubmitImport}
          />
        </Field>
      ) : null}
      <Feedback error={model.error} status={model.status} />
      <Button appearance='primary' onPress={events.onSubmitImport} size='large' width='full'>
        <Icon name='plus' size='small' />
        <Text variant='action'>Create account</Text>
      </Button>
    </Stack>
  )
}

function AddressRow({ model, onPress }: { model: AddAccountAddressRowModel; onPress: () => void }) {
  return (
    <Button
      appearance='row'
      label={`${model.imported ? 'Select' : 'Add'} ${model.label}`}
      onPress={onPress}
      size='list'
      width='full'
    >
      <Text tone='muted' variant='caption' shrink={false}>
        {model.index + 1}.
      </Text>
      <Stack gap='none' grow>
        <Text variant='label' truncate>
          {model.label}
        </Text>
        <Text tone='muted' variant='code'>
          {model.shortAddress}
        </Text>
      </Stack>
      <Stack align='end' gap='none'>
        {model.usage === 'loading' ? (
          <Text tone='muted' variant='caption'>
            Checking chains
          </Text>
        ) : null}
        {model.usage === 'used' ? (
          <Text tone='secondary' variant='micro'>
            Used on {model.chains.join(', ')}
          </Text>
        ) : null}
        {model.usage === 'unused' ? (
          <Text tone='muted' variant='caption'>
            Unused
          </Text>
        ) : null}
        {model.usage === 'unavailable' ? (
          <Text tone='muted' variant='caption'>
            Usage unavailable
          </Text>
        ) : null}
        {model.usage === 'value' && model.value ? <Text variant='numeric'>{model.value}</Text> : null}
        {model.imported ? (
          <Text tone='accent' variant='micro'>
            Imported
          </Text>
        ) : null}
      </Stack>
      {model.imported ? <Icon name='check' size='small' tone='accent' /> : null}
    </Button>
  )
}

function StoredSeedAccountSelectionView({
  events,
  model
}: {
  events: AddAccountViewEvents
  model: StoredSeedModel
}) {
  if (model.mode === 'empty') {
    return (
      <Surface padding='large' radius='card' tone='card'>
        <Stack align='center' gap='small'>
          <Text tone='secondary'>No stored recovery phrases</Text>
          <Button appearance='primary' onPress={events.onCreateSeedOpen} size='small'>
            <Icon name='plus' size='small' />
            <Text variant='compactAction'>Create recovery phrase</Text>
          </Button>
          <Button appearance='control' onPress={events.onImportSeedOpen} size='small'>
            <Text variant='compactAction'>Import recovery phrase</Text>
          </Button>
        </Stack>
      </Surface>
    )
  }
  if (model.mode === 'addresses') {
    return (
      <Stack gap='xsmall'>
        {model.rows.map((row) => (
          <AddressRow
            key={row.address}
            model={row}
            onPress={() => events.onStoredSeedAddressSelect(row.address)}
          />
        ))}
        <Feedback error={model.error} status={model.status} />
      </Stack>
    )
  }
  return (
    <Stack gap='small'>
      {model.seeds.map((seed) => (
        <Surface border='subtle' key={seed.id} padding='small' radius='card' tone='card'>
          <Stack gap='small'>
            <Inline align='center' gap='small' justify='between'>
              <Inline align='center' gap='small'>
                <Icon name='flame' size='medium' />
                <Text variant='label'>{seed.label}</Text>
              </Inline>
              <Text tone='secondary' variant='caption'>
                {seed.importedCount}/{seed.totalCount}
              </Text>
            </Inline>
            {seed.wallets.map((wallet) => (
              <Inline align='center' gap='small' justify='between' key={wallet.address}>
                <Text variant='supporting'>{wallet.name}</Text>
                <Text tone='muted' variant='code'>
                  {wallet.shortAddress}
                </Text>
              </Inline>
            ))}
            {seed.importedCount > 3 && !seed.expanded ? (
              <Button appearance='ghost' onPress={() => events.onStoredSeedExpand(seed.id)} size='compact'>
                <Text variant='caption'>More wallets</Text>
              </Button>
            ) : null}
            <Button
              appearance='subtle'
              onPress={() => events.onStoredSeedSelect(seed.id)}
              size='small'
              width='full'
            >
              <Icon name='plus' size='small' />
              <Text variant='compactAction'>Add address</Text>
            </Button>
          </Stack>
        </Surface>
      ))}
    </Stack>
  )
}

function GeneratedSeedConfirmationView({
  events,
  model
}: {
  events: AddAccountViewEvents
  model: GeneratedSeedModel
}) {
  return (
    <Stack gap='small'>
      <Surface border='danger' padding='small' radius='small' tone='card'>
        <Inline align='center' gap='small'>
          <Icon name='warning' size='small' tone='danger' />
          <Text tone='danger' variant='supporting'>
            Save these words in order. Newframe cannot recover them later.
          </Text>
        </Inline>
      </Surface>
      {model.words.length ? (
        <Grid columns='three' gap='small'>
          {model.words.map((word, index) => (
            <Surface key={`${word}-${index}`} padding='small' radius='small' tone='raised'>
              <Inline align='center' gap='xsmall'>
                <Text tone='muted' variant='caption'>
                  {index + 1}
                </Text>
                <Text as='strong' variant='supporting'>
                  {word}
                </Text>
              </Inline>
            </Surface>
          ))}
        </Grid>
      ) : (
        <Surface padding='large' radius='card' tone='card'>
          {model.status ? (
            <Spinner label={model.status} />
          ) : (
            <Text align='center'>Preparing recovery phrase</Text>
          )}
        </Surface>
      )}
      <Inline align='center' gap='small'>
        <Button
          appearance='control'
          label='Copy recovery phrase'
          onPress={events.onGeneratedSeedCopy}
          shape='pill'
          size='small'
        >
          <Text variant='compactAction'>{model.copied ? 'Copied' : 'Copy'}</Text>
        </Button>
        <Button
          appearance='control'
          label='Generate new recovery phrase'
          onPress={events.onGeneratedSeedRegenerate}
          shape='pill'
          size='small'
        >
          <Text variant='compactAction'>New phrase</Text>
        </Button>
      </Inline>
      <ToggleButton
        appearance='row'
        label='Recovery phrase saved'
        onPress={events.onGeneratedSeedBackupToggle}
        pressed={model.backedUp}
        size='medium'
      >
        {model.backedUp ? <Icon name='check' size='small' tone='accent' /> : null}
        <Text variant='supporting'>I saved this recovery phrase</Text>
      </ToggleButton>
      <Field label='Account name' vertical>
        <Input
          label='Account name'
          spellCheck={false}
          value={model.name}
          onValueChange={events.onNameChange}
        />
      </Field>
      {model.needsFramePassword ? (
        <Field label={model.passwordLabel} vertical>
          <Input
            label={model.passwordLabel}
            spellCheck={false}
            type='password'
            value={model.password}
            onValueChange={events.onPasswordChange}
            onSubmit={events.onCreateGeneratedSeed}
          />
        </Field>
      ) : null}
      <Feedback error={model.error} status={model.status} />
      <Button appearance='primary' onPress={events.onCreateGeneratedSeed} size='large' width='full'>
        <Icon name='plus' size='small' />
        <Text variant='action'>Create account</Text>
      </Button>
    </Stack>
  )
}

function HardwareInputView({ events, model }: { events: AddAccountViewEvents; model: HardwareInputModel }) {
  if (model.kind === 'pin')
    return (
      <Surface padding='medium' radius='card' tone='card'>
        <Stack gap='small'>
          <Text align='center' variant='code'>
            {'•'.repeat(model.length) || 'Enter PIN positions'}
          </Text>
          <Grid columns='three' gap='small'>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
              <Button
                appearance='control'
                key={digit}
                label={`PIN position ${digit}`}
                onPress={() => events.onHardwarePinAppend(digit)}
                size='medium'
              >
                <Text variant='numeric'>{digit}</Text>
              </Button>
            ))}
          </Grid>
          <Inline align='center' gap='small'>
            <Button
              appearance='control'
              label='Submit Trezor PIN'
              onPress={() => events.onHardwareSubmit('pin')}
              shape='pill'
              size='small'
            >
              <Text variant='compactAction'>Submit PIN</Text>
            </Button>
            <Button
              appearance='control'
              label='Delete PIN digit'
              onPress={events.onHardwarePinDelete}
              shape='pill'
              size='small'
            >
              <Text variant='compactAction'>Delete</Text>
            </Button>
          </Inline>
        </Stack>
      </Surface>
    )
  if (model.kind === 'passphrase')
    return (
      <Surface padding='medium' radius='card' tone='card'>
        <Stack gap='small'>
          <Field label='Passphrase' vertical>
            <Input
              label='Trezor passphrase'
              spellCheck={false}
              type='password'
              value={model.value}
              onValueChange={events.onHardwarePassphraseChange}
              onSubmit={() => events.onHardwareSubmit('passphrase')}
            />
          </Field>
          <Inline align='center' gap='small'>
            <Button
              appearance='control'
              label='Submit Trezor passphrase'
              onPress={() => events.onHardwareSubmit('passphrase')}
              shape='pill'
              size='small'
            >
              <Text variant='compactAction'>Submit</Text>
            </Button>
            {model.allowsDeviceEntry ? (
              <Button
                appearance='control'
                label='Enter passphrase on Trezor'
                onPress={() => events.onHardwareSubmit('device-passphrase')}
                shape='pill'
                size='small'
              >
                <Text variant='compactAction'>On device</Text>
              </Button>
            ) : null}
          </Inline>
        </Stack>
      </Surface>
    )
  if (model.kind === 'pair')
    return (
      <Surface padding='medium' radius='card' tone='card'>
        <Stack gap='small'>
          <Field label='Pairing code' vertical>
            <Input
              label='GridPlus pairing code'
              spellCheck={false}
              value={model.value}
              onValueChange={events.onHardwarePairCodeChange}
              onSubmit={events.onHardwarePair}
            />
          </Field>
          <Button appearance='primary' onPress={events.onHardwarePair} size='large' width='full'>
            <Icon name='check' size='small' />
            <Text variant='action'>Pair</Text>
          </Button>
        </Stack>
      </Surface>
    )
  return null
}

function HardwarePaginationView({
  events,
  model
}: {
  events: AddAccountViewEvents
  model: HardwarePaginationModel
}) {
  const buttons = [
    { label: 'First', page: 1 },
    { label: 'Previous', page: model.page - 1 },
    { label: 'Next', page: model.page + 1 },
    { label: 'Last', page: model.maxPage }
  ]
  const jump = () => events.onPageChange(Number(model.input))
  return (
    <Stack gap='xsmall'>
      <Inline align='center' gap='xsmall' justify='between'>
        {buttons.slice(0, 2).map((button) => (
          <Button
            appearance='control'
            disabled={model.page === 1}
            key={button.label}
            label={`${button.label} account page`}
            onPress={() => events.onPageChange(button.page)}
            size='compact'
          >
            <Text variant='compactAction'>{button.label}</Text>
          </Button>
        ))}
        <Text tone='secondary' variant='caption'>
          Page {model.page} of {model.maxPage}
        </Text>
        {buttons.slice(2).map((button) => (
          <Button
            appearance='control'
            disabled={model.page === model.maxPage}
            key={button.label}
            label={`${button.label} account page`}
            onPress={() => events.onPageChange(button.page)}
            size='compact'
          >
            <Text variant='compactAction'>{button.label}</Text>
          </Button>
        ))}
      </Inline>
      <Inline align='center' gap='xsmall'>
        <Text tone='muted' variant='caption' shrink={false}>
          Go to page
        </Text>
        <Input
          align='end'
          appearance='numeric'
          inputMode='numeric'
          label='Account page number'
          max={model.maxPage}
          min={1}
          onSubmit={jump}
          onValueChange={events.onPageInputChange}
          type='number'
          value={model.input}
        />
        <Button appearance='control' onPress={jump} size='small'>
          <Text variant='compactAction'>Go</Text>
        </Button>
      </Inline>
    </Stack>
  )
}

function HardwareAccountSelectionView({
  events,
  model
}: {
  events: AddAccountViewEvents
  model: HardwareModel
}) {
  if (model.mode === 'list')
    return (
      <Stack gap='small'>
        {model.signers.length ? (
          <Stack gap='xsmall'>
            {model.signers.map((signer) => (
              <Button
                appearance='row'
                key={signer.id}
                label={`View ${signer.name} accounts`}
                onPress={() => events.onHardwareSelect(signer.id)}
                size='list'
                width='full'
              >
                <Icon name={signerIconName(signer.type)} size='medium' />
                <Stack gap='none' grow>
                  <Text variant='label'>{signer.name}</Text>
                  <Text tone='secondary' variant='caption'>
                    {signer.status}
                  </Text>
                </Stack>
                <Text tone='accent' variant='caption'>
                  {signer.addressCount} accounts
                </Text>
                <Icon name='arrowRight' size='small' tone='muted' />
              </Button>
            ))}
          </Stack>
        ) : (
          <Surface padding='large' radius='card' tone='card'>
            <Stack align='center' gap='small'>
              <Text>Unlock your {model.title} to get started</Text>
              {model.type !== 'lattice' ? (
                <Text tone='secondary' variant='supporting'>
                  {model.title} will appear here when detected
                </Text>
              ) : null}
            </Stack>
          </Surface>
        )}
        {model.type === 'lattice' ? (
          <Stack gap='small'>
            <Field label='Device name' vertical>
              <Input
                label='Lattice device name'
                spellCheck={false}
                value={model.deviceName}
                onValueChange={events.onLatticeNameChange}
              />
            </Field>
            <Field label='Device ID' vertical>
              <Input
                label='Lattice device ID'
                spellCheck={false}
                value={model.deviceId}
                onValueChange={events.onInputChange}
                onSubmit={events.onCreateLattice}
              />
            </Field>
            <Feedback error={model.error} status={model.status} />
            <Button appearance='primary' onPress={events.onCreateLattice} size='large' width='full'>
              <Icon name='plus' size='small' />
              <Text variant='action'>Create signer</Text>
            </Button>
          </Stack>
        ) : null}
      </Stack>
    )
  return (
    <Stack gap='small'>
      <Surface border='subtle' padding='small' radius='card' tone='card'>
        <Inline align='center' gap='small'>
          <Icon name={signerIconName(model.signer.type)} size='medium' />
          <Stack gap='none' grow>
            <Text variant='label'>{model.signer.name}</Text>
            <Text tone='secondary' variant='caption'>
              {model.signer.status}
            </Text>
          </Stack>
          {model.signer.loading ? <Spinner label='Connecting hardware wallet' /> : null}
        </Inline>
      </Surface>
      <HardwareInputView events={events} model={model.input} />
      {model.rows.length ? (
        <Stack gap='xsmall'>
          {model.rows.map((row) => (
            <AddressRow
              key={row.address}
              model={row}
              onPress={() => events.onHardwareAddressSelect(row.address)}
            />
          ))}
        </Stack>
      ) : (
        <Surface padding='large' radius='card' tone='card'>
          <Text align='center' tone='secondary'>
            {model.emptyText}
          </Text>
        </Surface>
      )}
      {model.pagination ? <HardwarePaginationView events={events} model={model.pagination} /> : null}
      <Feedback error={model.error} status={model.status} />
      <Inline align='center' gap='small'>
        <Button
          appearance='control'
          label={`Reconnect ${model.title}`}
          onPress={events.onHardwareReload}
          shape='pill'
          size='small'
        >
          <Text variant='compactAction'>Reconnect</Text>
        </Button>
        <Button
          appearance='danger'
          label={`Remove ${model.title}`}
          onPress={events.onHardwareRemove}
          shape='pill'
          size='small'
        >
          <Text variant='compactAction'>Remove</Text>
        </Button>
      </Inline>
    </Stack>
  )
}

export function AddAccountView({
  events,
  flow
}: {
  events: AddAccountViewEvents
  flow: AddAccountFlowModel
}) {
  const body =
    flow.kind === 'methods' ? (
      <MethodView events={events} flow={flow} />
    ) : flow.kind === 'import' ? (
      <AddAccountImportView events={events} model={flow.model} />
    ) : flow.kind === 'stored-seed' ? (
      <StoredSeedAccountSelectionView events={events} model={flow.model} />
    ) : flow.kind === 'generated-seed' ? (
      <GeneratedSeedConfirmationView events={events} model={flow.model} />
    ) : (
      <HardwareAccountSelectionView events={events} model={flow.model} />
    )
  return (
    <Stack grow gap='none'>
      <SidePanelHeader closeLabel='Back' onClose={events.onBack} title='Add account' />
      <ScrollArea height='fill'>
        <Surface padding='medium' radius='none' tone='transparent'>
          {body}
        </Surface>
      </ScrollArea>
    </Stack>
  )
}
