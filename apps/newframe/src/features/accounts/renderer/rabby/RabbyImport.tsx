import { Button } from '@newframe/ui/button'
import { Field } from '@newframe/ui/field'
import { Icon } from '@newframe/ui/icon'
import { Inline } from '@newframe/ui/inline'
import { Input } from '@newframe/ui/input'
import { ScrollArea } from '@newframe/ui/scroll-area'
import { Spinner } from '@newframe/ui/spinner'
import { Stack } from '@newframe/ui/stack'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'
import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import type { QueryResultMap } from '../../../../app/contracts/operations'
import type { QrCameraCapability } from '../../../../platform/desktop/renderer/camera'
import type { OperationRecord } from '../../../../platform/operations/operation'
import { useWalletSelector } from '../../../../platform/state-sync/renderer/useAppSelector'
import { AddressAvatar } from '../../../../shared/renderer/ui/AddressAvatar'
import { shortAddress } from '../../../../shared/renderer/ui/AddressIdentity'
import { SidePanelHeader } from '../../../../shared/renderer/ui/SidePanel/SidePanelHeader'
import type { AccountsCapability } from '../accountsCapability'
import { QrScanner } from '../airgap/QrScanner'
import { createRabbyQrReceiver } from './qrReceiver'

type Preview = Extract<QueryResultMap['rabby.preview'], { ok: true }>
type Step = 'intro' | 'scan' | 'password' | 'review' | 'importing' | 'done'

const kindLabels = {
  mnemonic: 'Recovery phrase',
  'private-key': 'Private key',
  watch: 'Watch-only',
  safe: 'Safe',
  hardware: 'Hardware · Watch-only'
}

export function RabbyImport({
  capability,
  camera,
  vault,
  onBack,
  onClose
}: {
  capability: AccountsCapability
  camera: QrCameraCapability
  vault: { exists: boolean; unlocked: boolean } | null
  onBack: () => void
  onClose: () => void
}) {
  const [step, setStep] = useState<Step>('intro')
  const [progress, setProgress] = useState(0)
  const [password, setPassword] = useState('')
  const [newframePassword, setNewframePassword] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [operationId, setOperationId] = useState('')
  const envelope = useRef('')
  const receiver = useRef<ReturnType<typeof createRabbyQrReceiver> | null>(null)
  const generation = useRef(0)
  const submitting = useRef(false)
  const { active, locked, operation } = useWalletSelector(
    useShallow((state) => ({
      active: state.tray.open && !state.appLock.locked,
      locked: state.appLock.locked,
      operation: (state.operations as Record<string, OperationRecord | undefined>)[operationId]
    }))
  )

  useEffect(
    () => () => {
      generation.current += 1
      envelope.current = ''
      receiver.current = null
    },
    []
  )

  useEffect(() => {
    if (!locked) {
      return
    }
    generation.current += 1
    envelope.current = ''
    receiver.current = null
    submitting.current = false
    queueMicrotask(() => {
      setPassword('')
      setNewframePassword('')
      setPreview(null)
      setOperationId('')
      setBusy(false)
      setError('')
      setStep('intro')
    })
  }, [locked])

  useEffect(() => {
    if (locked || step !== 'importing' || !operation || operation.status === 'pending') {
      return
    }
    const request = generation.current
    queueMicrotask(() => {
      if (request !== generation.current) {
        return
      }
      submitting.current = false
      setBusy(false)
      if (operation.status === 'succeeded') {
        envelope.current = ''
        receiver.current = null
        setPassword('')
        setNewframePassword('')
        setStep('done')
      } else {
        setError(operation.error?.message ?? 'Could not import the Rabby accounts. Try again.')
        setStep('review')
      }
    })
  }, [operation, step, locked])

  function scan() {
    generation.current += 1
    envelope.current = ''
    receiver.current = createRabbyQrReceiver()
    setPassword('')
    setNewframePassword('')
    setPreview(null)
    setProgress(0)
    setError('')
    setStep('scan')
  }

  async function review() {
    if (!password || submitting.current || !envelope.current) {
      return
    }
    const request = ++generation.current
    submitting.current = true
    setBusy(true)
    setError('')
    try {
      const result = await capability.previewRabby({ data: envelope.current, password })
      if (generation.current !== request) {
        return
      }
      if (!result.ok) {
        setError(result.message ?? 'Could not unlock the export. Check your Rabby password and try again.')
        return
      }
      setPreview(result)
      setStep('review')
    } catch {
      if (generation.current === request) {
        setError('Could not unlock the export. Try again.')
      }
    } finally {
      if (generation.current === request) {
        submitting.current = false
        setBusy(false)
      }
    }
  }

  async function importAccounts() {
    if (!preview?.importCount || submitting.current) {
      return
    }
    const id = crypto.randomUUID()
    const request = ++generation.current
    submitting.current = true
    setOperationId(id)
    setBusy(true)
    setError('')
    setStep('importing')
    try {
      const result = await capability.importRabby({
        operationId: id,
        data: envelope.current,
        password,
        ...(newframePassword ? { newframePassword } : {})
      })
      if (generation.current !== request) {
        return
      }
      if (!result.ok) {
        submitting.current = false
        setBusy(false)
        setError(result.message ?? 'Could not start the import. Try again.')
        setStep('review')
      }
    } catch {
      if (generation.current === request) {
        submitting.current = false
        setBusy(false)
        setError('Could not start the import. Try again.')
        setStep('review')
      }
    }
  }

  const newCount = preview?.importCount ?? 0
  const skipCount = preview?.skipCount ?? 0
  const needsVault =
    preview?.accounts.some(
      (account) => !account.duplicate && (account.kind === 'mnemonic' || account.kind === 'private-key')
    ) &&
    (!vault?.exists || !vault.unlocked)
  const newframePasswordLabel = vault?.exists ? 'Newframe password' : 'Create Newframe password'
  const outcome = operation?.phase?.match(/^imported_(\d+)_skipped_(\d+)$/)
  const importedCount = outcome ? Number(outcome[1]) : newCount
  const importedSkipCount = outcome ? Number(outcome[2]) : skipCount
  let title = 'Import from Rabby'
  if (step === 'review' || step === 'importing') {
    title = 'Review accounts'
  } else if (step === 'done') {
    title = 'Import complete'
  }

  return (
    <Stack grow gap='none'>
      <SidePanelHeader
        closeLabel='Back'
        onClose={() => {
          if (busy) {
            return
          }
          generation.current += 1
          if (step === 'intro' || step === 'done') {
            onBack()
          } else if (step === 'review') {
            setStep('password')
            setPreview(null)
            setError('')
          } else {
            envelope.current = ''
            receiver.current = null
            setPassword('')
            setNewframePassword('')
            setError('')
            setStep('intro')
          }
        }}
        title={title}
      />
      <ScrollArea height='fill'>
        <Surface padding='medium' radius='none' tone='transparent'>
          <Stack gap='medium'>
            {step === 'intro' ? (
              <>
                <Text variant='body'>Bring your Rabby accounts into Newframe.</Text>
                <Stack gap='small'>
                  <Text variant='supporting'>1. Open Rabby Extension and choose Sync to mobile.</Text>
                  <Text variant='supporting'>
                    2. Enter your Rabby password and select the accounts to export.
                  </Text>
                  <Text variant='supporting'>
                    3. Scan the animated QR here, then unlock it with your Rabby password.
                  </Text>
                </Stack>
                <Surface border='subtle' padding='medium' radius='card' tone='card'>
                  <Stack gap='small'>
                    <Text variant='label'>Rabby Wallet Import</Text>
                    <Text variant='supporting'>
                      New accounts go into a new profile. Accounts already in Newframe are skipped.
                    </Text>
                    <Text tone='secondary' variant='caption'>
                      Transfers accounts and labels. Rabby activity, connections and settings are not
                      included.
                    </Text>
                  </Stack>
                </Surface>
                <Text variant='supporting'>
                  Recovery phrases and private keys are included in the encrypted QR. Keep it private.
                  Selecting a seed account transfers its whole recovery phrase.
                </Text>
                <Button appearance='primary' disabled={locked} onPress={scan} size='large' width='full'>
                  <Icon name='qr' size='small' />
                  <Text variant='action'>Scan QR</Text>
                </Button>
              </>
            ) : null}
            {step === 'scan' ? (
              <>
                <Text variant='supporting'>
                  Keep Rabby&apos;s animated QR in view until the scan finishes.
                </Text>
                {!error ? (
                  <QrScanner
                    active={active}
                    camera={camera}
                    onError={setError}
                    onFrame={async (frame) => {
                      const result = receiver.current?.receive(frame)
                      if (!result) {
                        return
                      }
                      if (result.complete) {
                        envelope.current = result.data
                        receiver.current = null
                        setStep('password')
                      } else {
                        setProgress(Math.round(result.progress * 100))
                      }
                    }}
                  />
                ) : null}
                <progress aria-label='Rabby QR scan progress' max={100} value={progress} />
                <Text variant='supporting'>Reading QR {progress}%</Text>
                {error ? (
                  <Button appearance='primary' onPress={scan}>
                    Retry scan
                  </Button>
                ) : null}
              </>
            ) : null}
            {step === 'password' ? (
              <>
                <Inline align='center' gap='small'>
                  <Icon name='check' size='medium' />
                  <Text variant='label'>QR received</Text>
                </Inline>
                <Text variant='supporting'>
                  Enter your Rabby Extension password to unlock the export. Nothing is imported until you
                  review the accounts.
                </Text>
                <Field label='Rabby password' vertical>
                  <Input
                    disabled={busy}
                    label='Rabby password'
                    onSubmit={() => void review()}
                    onValueChange={setPassword}
                    spellCheck={false}
                    type='password'
                    value={password}
                  />
                </Field>
                <Button
                  appearance='primary'
                  disabled={busy || !password}
                  onPress={() => void review()}
                  size='large'
                  width='full'
                >
                  {busy ? <Spinner label='Unlocking Rabby export' /> : null}
                  <Text variant='action'>{busy ? 'Unlocking export' : 'Review accounts'}</Text>
                </Button>
                <Button appearance='control' disabled={busy} onPress={scan}>
                  Scan again
                </Button>
              </>
            ) : null}
            {(step === 'review' || step === 'importing') && preview ? (
              <>
                <Surface border='subtle' padding='medium' radius='card' tone='card'>
                  <Stack gap='small'>
                    <Text variant='label'>
                      {newCount
                        ? `${newCount} new account${newCount === 1 ? '' : 's'}`
                        : 'All accounts already imported'}
                    </Text>
                    <Text variant='supporting'>
                      {skipCount} existing account{skipCount === 1 ? '' : 's'} skipped
                    </Text>
                    {newCount ? (
                      <Text tone='secondary' variant='caption'>
                        New profile: Rabby Wallet Import
                      </Text>
                    ) : null}
                  </Stack>
                </Surface>
                <Stack gap='small'>
                  {preview.accounts.map((account) => (
                    <Surface border='subtle' key={account.address} padding='small' radius='card' tone='card'>
                      <Inline align='center' gap='small'>
                        <AddressAvatar address={account.address} size='sm' />
                        <Stack gap='xsmall' grow>
                          <Text variant='label'>{account.name}</Text>
                          <Text tone='secondary' variant='caption'>
                            {shortAddress(account.address)} · {kindLabels[account.kind]}
                          </Text>
                          {account.chainIds?.length ? (
                            <Text tone='secondary' variant='caption'>
                              Networks: {account.chainIds.join(', ')}
                            </Text>
                          ) : null}
                          {account.duplicate ? (
                            <Text tone='secondary' variant='caption'>
                              Already in Newframe · Skipped
                            </Text>
                          ) : null}
                          {!account.duplicate && account.warning ? (
                            <Text variant='caption'>{account.warning}</Text>
                          ) : null}
                        </Stack>
                      </Inline>
                    </Surface>
                  ))}
                </Stack>
                {preview.unsupportedMetadata.length ? (
                  <Text tone='secondary' variant='caption'>
                    Not transferred: {preview.unsupportedMetadata.join(', ')}.
                  </Text>
                ) : null}
                {needsVault && newCount ? (
                  <Field label={newframePasswordLabel} vertical>
                    <Input
                      disabled={busy}
                      label={newframePasswordLabel}
                      onValueChange={setNewframePassword}
                      spellCheck={false}
                      type='password'
                      value={newframePassword}
                    />
                  </Field>
                ) : null}
                {newCount ? (
                  <Button
                    appearance='primary'
                    disabled={busy || (needsVault && !newframePassword)}
                    onPress={() => void importAccounts()}
                    size='large'
                    width='full'
                  >
                    {busy ? <Spinner label='Importing Rabby accounts' /> : null}
                    <Text variant='action'>
                      {busy ? 'Importing accounts' : `Import ${newCount} account${newCount === 1 ? '' : 's'}`}
                    </Text>
                  </Button>
                ) : (
                  <Button appearance='primary' onPress={onClose} size='large' width='full'>
                    Done
                  </Button>
                )}
              </>
            ) : null}
            {step === 'done' ? (
              <>
                <Icon name='check' size='large' />
                <Text variant='label'>
                  {importedCount} account{importedCount === 1 ? '' : 's'} imported
                </Text>
                <Text variant='supporting'>
                  {importedSkipCount} existing account{importedSkipCount === 1 ? '' : 's'} skipped
                </Text>
                <Text variant='supporting'>
                  {importedCount
                    ? 'Your accounts are ready in Rabby Wallet Import.'
                    : 'All accounts are already in Newframe. No new profile was created.'}
                </Text>
                <Button appearance='primary' onPress={onClose} size='large' width='full'>
                  View imported accounts
                </Button>
              </>
            ) : null}
            {error ? (
              <div role='alert'>
                <Text tone='danger' variant='supporting'>
                  {error}
                </Text>
              </div>
            ) : null}
          </Stack>
        </Surface>
      </ScrollArea>
    </Stack>
  )
}
