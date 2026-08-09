import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@newframe/ui/button'
import { Grid } from '@newframe/ui/grid'
import { Icon } from '@newframe/ui/icon'
import { Input } from '@newframe/ui/input'
import { Spinner } from '@newframe/ui/spinner'
import { Stack } from '@newframe/ui/stack'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'

import link from '../../../../platform/ipc/renderer/link'
import { AppIcon } from '../../../../shared/renderer/ui/appIcon'
import {
  signerIconName,
  signerIsLoading,
  signerIsReady,
  signerStatusText
} from '../../../../shared/renderer/ui/signerPresentation'
import { useWalletSelector } from '../../../../platform/state-sync/renderer/useAppSelector'
import type { TrayRendererState } from '../../../../app/renderer/tray/state'
import type { TrayNotifier } from '../../../../app/renderer/tray/notification'

type WalletSigner = TrayRendererState['signers'][string]

function signerIcon(type: string) {
  return ['ledger', 'trezor', 'lattice'].includes(type) ? (
    <Icon name={signerIconName(type)} size='large' />
  ) : (
    <AppIcon name='logo' size={22} />
  )
}

function RecoveryActions({
  operationId,
  reload,
  signer
}: {
  operationId: string
  reload: () => void
  signer: WalletSigner
}) {
  const [latticePairCode, setLatticePairCode] = useState('')
  const [trezorPassphrase, setTrezorPassphrase] = useState('')
  const [trezorPin, setTrezorPin] = useState('')
  const status = signer.status.toLowerCase()

  const submitPin = () => {
    if (!trezorPin) return
    void link.executeCommand({
      type: 'signer.trezor-input',
      operationId,
      actionId: crypto.randomUUID(),
      signerId: signer.id,
      input: 'pin',
      value: trezorPin
    })
    setTrezorPin('')
  }
  const submitPassphrase = () => {
    void link.executeCommand({
      type: 'signer.trezor-input',
      operationId,
      actionId: crypto.randomUUID(),
      signerId: signer.id,
      input: 'passphrase',
      value: trezorPassphrase
    })
    setTrezorPassphrase('')
  }
  const pairLattice = () => {
    if (!latticePairCode) return
    void link.executeCommand({
      type: 'signer.lattice-pair',
      operationId,
      actionId: crypto.randomUUID(),
      signerId: signer.id,
      pairCode: latticePairCode
    })
    setLatticePairCode('')
  }

  if (status === 'ok') return null

  if (signer.type === 'trezor' && status === 'need pin') {
    return (
      <Stack gap='medium'>
        <Surface border='subtle' padding='medium' radius='pill' tone='raised'>
          <Text align='center' variant='code'>
            {'•'.repeat(trezorPin.length) || 'Enter PIN'}
          </Text>
        </Surface>
        <Grid columns='three' gap='medium'>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((position) => (
            <Button
              appearance='control'
              key={position}
              label={`PIN position ${position}`}
              onPress={() => setTrezorPin((value) => value + position)}
              shape='control'
              size='large'
            >
              <Text decorative variant='heading'>
                •
              </Text>
            </Button>
          ))}
        </Grid>
        <Stack direction='row' equal gap='small'>
          <Button
            appearance='control'
            disabled={!trezorPin}
            onPress={() => setTrezorPin((value) => value.slice(0, -1))}
          >
            <Text variant='action'>Delete</Text>
          </Button>
          <Button appearance='primary' disabled={!trezorPin} onPress={submitPin}>
            <Text variant='action'>Submit PIN</Text>
          </Button>
        </Stack>
      </Stack>
    )
  }

  if (signer.type === 'trezor' && status === 'enter passphrase') {
    const allowsDeviceEntry = (signer.capabilities || []).includes('Capability_PassphraseEntry')
    return (
      <Stack gap='small'>
        <Input
          autoFocus
          label='Trezor passphrase'
          onSubmit={submitPassphrase}
          onValueChange={setTrezorPassphrase}
          type='password'
          value={trezorPassphrase}
        />
        <Button appearance='primary' onPress={submitPassphrase} width='full'>
          <Text variant='action'>Submit Passphrase</Text>
        </Button>
        {allowsDeviceEntry ? (
          <Button
            appearance='control'
            onPress={() =>
              void link.executeCommand({
                type: 'signer.trezor-input',
                operationId,
                actionId: crypto.randomUUID(),
                signerId: signer.id,
                input: 'device-passphrase'
              })
            }
            width='full'
          >
            <Text variant='action'>Enter on Device</Text>
          </Button>
        ) : null}
      </Stack>
    )
  }

  if (signer.type === 'lattice' && status === 'pair') {
    return (
      <Stack gap='small'>
        <Input
          autoFocus
          label='Lattice pairing code'
          onSubmit={pairLattice}
          onValueChange={(value) => setLatticePairCode(value.toUpperCase())}
          value={latticePairCode}
        />
        <Button appearance='primary' disabled={!latticePairCode} onPress={pairLattice} width='full'>
          <Text variant='action'>Pair Lattice</Text>
        </Button>
      </Stack>
    )
  }

  if (signerIsLoading(status)) return <Spinner label='Connecting hardware wallet' size='large' />

  const canReload = signer.type !== 'trezor' || status === 'disconnected' || status.includes('reconnect')
  return canReload ? (
    <Button appearance='control' onPress={reload} width='full'>
      <Text variant='action'>Retry Connection</Text>
    </Button>
  ) : null
}

export default function SignerRecovery({
  dismiss,
  signerIds
}: {
  dismiss: TrayNotifier
  signerIds: string[]
}) {
  const signers = useWalletSelector((state: TrayRendererState) => state.signers)
  const candidates = useMemo(
    () => signerIds.map((id) => signers[id]).filter((signer): signer is WalletSigner => Boolean(signer)),
    [signerIds, signers]
  )
  const [selectedId, setSelectedId] = useState(candidates[0]?.id || '')
  const [session, setSession] = useState<{ operationId: string; signerId: string } | null>(null)
  const sessionRef = useRef(session)

  const signer = candidates.find((candidate) => candidate.id === selectedId) || candidates[0]

  function setActiveSession(next: { operationId: string; signerId: string } | null) {
    sessionRef.current = next
    setSession(next)
  }

  function finishSession(outcome: 'ready' | 'cancelled') {
    const current = sessionRef.current
    if (!current) return
    setActiveSession(null)
    void link.executeCommand({
      type: 'signer.hardware-session-finish',
      operationId: current.operationId,
      signerId: current.signerId,
      outcome
    })
  }

  function startSession(signerId: string, reload = false) {
    finishSession('cancelled')
    const operationId = crypto.randomUUID()
    setActiveSession({ operationId, signerId })
    void link.executeCommand(
      reload
        ? { type: 'signer.reload', operationId, signerId }
        : { type: 'signer.hardware-session-start', operationId, signerId }
    )
  }

  useEffect(() => {
    if (!signer || sessionRef.current?.signerId === signer.id) return
    const signerId = signer.id
    queueMicrotask(() => {
      if (sessionRef.current?.signerId !== signerId) startSession(signerId)
    })
    // The signer ID is the session bootstrap key; startSession uses the current session ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signer?.id])

  useEffect(
    () => () => {
      const current = sessionRef.current
      if (!current) return
      sessionRef.current = null
      void link.executeCommand({
        type: 'signer.hardware-session-finish',
        operationId: current.operationId,
        signerId: current.signerId,
        outcome: 'cancelled'
      })
    },
    []
  )

  function selectSigner(signerId: string) {
    if (signerId === signer?.id) return
    startSession(signerId)
    setSelectedId(signerId)
  }

  function close() {
    finishSession(signerIsReady(signer?.status) ? 'ready' : 'cancelled')
    dismiss()
  }

  return (
    <Stack gap='large'>
      <Text align='center' variant='heading'>
        Hardware Wallet
      </Text>
      {candidates.length > 1 ? (
        <Stack direction='row' equal gap='small'>
          {candidates.map((candidate) => (
            <Button
              appearance='segment'
              key={candidate.id}
              onPress={() => selectSigner(candidate.id)}
              pressed={candidate.id === signer?.id}
            >
              <Text variant='compactAction'>{candidate.name}</Text>
            </Button>
          ))}
        </Stack>
      ) : null}
      {signer ? (
        <Stack align='center' gap='medium'>
          <Surface padding='medium' radius='pill' tone='control'>
            {signerIcon(signer.type)}
          </Surface>
          <Text variant='label'>{signer.name}</Text>
          <Text align='center' tone={signerIsReady(signer.status) ? 'success' : 'secondary'}>
            {signerStatusText(signer)}
          </Text>
          {session?.signerId === signer.id ? (
            <RecoveryActions
              key={signer.id}
              operationId={session.operationId}
              reload={() => startSession(signer.id, true)}
              signer={signer}
            />
          ) : null}
          {signerIsReady(signer.status) ? (
            <Text align='center' tone='secondary'>
              Return to the request and select Sign again.
            </Text>
          ) : null}
        </Stack>
      ) : (
        <Text align='center' tone='secondary'>
          The hardware wallet is no longer available.
        </Text>
      )}
      <Button appearance='control' onPress={close} width='full'>
        <Text variant='action'>{signerIsReady(signer?.status) ? 'Continue' : 'Cancel'}</Text>
      </Button>
    </Stack>
  )
}
