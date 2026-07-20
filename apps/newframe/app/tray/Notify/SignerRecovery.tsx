import { useEffect, useMemo, useState } from 'react'
import { Button } from '@newframe/ui/button'
import { Grid } from '@newframe/ui/grid'
import { Input } from '@newframe/ui/input'
import { Spinner } from '@newframe/ui/spinner'
import { Stack } from '@newframe/ui/stack'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'

import link from '../../../resources/link'
import svg from '../../../resources/svg'
import { useWalletSelector } from '../../state/useAppSelector'
import type { TrayRendererState } from '../state'
import type { TrayNotifier } from '../notification'

type WalletSigner = TrayRendererState['signers'][string]

function signerIcon(type: string) {
  if (type === 'ledger') return svg.ledger(22)
  if (type === 'trezor') return svg.trezor(22)
  if (type === 'lattice') return svg.lattice(22)
  return svg.logo(22)
}

function signerStatus(signer: WalletSigner) {
  const status = signer.status.toLowerCase()
  if (status === 'ok') return 'Connected and ready to sign'
  if (status === 'locked') return `Unlock your ${signer.type}`
  if (status === 'pair') return 'Pair your Lattice'
  if (status === 'need pin') return 'Enter the PIN positions shown on your Trezor'
  if (status === 'enter passphrase') return 'Enter your Trezor passphrase'
  return signer.status || `Connect your ${signer.type}`
}

function isLoading(status: string) {
  const normalized = status.toLowerCase()
  return ['loading', 'connecting', 'addresses', 'input', 'pairing'].some((value) =>
    normalized.includes(value)
  )
}

function RecoveryActions({ signer }: { signer: WalletSigner }) {
  const [latticePairCode, setLatticePairCode] = useState('')
  const [trezorPassphrase, setTrezorPassphrase] = useState('')
  const [trezorPin, setTrezorPin] = useState('')
  const status = signer.status.toLowerCase()

  const reload = () => void link.executeCommand({ type: 'signer.reload', signerId: signer.id })
  const submitPin = () => {
    if (!trezorPin) return
    void link.executeCommand({
      type: 'signer.trezor-input',
      signerId: signer.id,
      input: 'pin',
      value: trezorPin
    })
    setTrezorPin('')
  }
  const submitPassphrase = () => {
    void link.executeCommand({
      type: 'signer.trezor-input',
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

  if (isLoading(status)) return <Spinner label='Connecting hardware wallet' size='large' />

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

  useEffect(() => {
    if (!candidates.some((signer) => signer.id === selectedId)) setSelectedId(candidates[0]?.id || '')
  }, [candidates, selectedId])

  const signer = candidates.find((candidate) => candidate.id === selectedId) || candidates[0]

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
              onPress={() => setSelectedId(candidate.id)}
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
          <Text align='center' tone={signer.status.toLowerCase() === 'ok' ? 'success' : 'secondary'}>
            {signerStatus(signer)}
          </Text>
          <RecoveryActions key={signer.id} signer={signer} />
          {signer.status.toLowerCase() === 'ok' ? (
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
      <Button appearance='control' onPress={() => dismiss()} width='full'>
        <Text variant='action'>{signer?.status.toLowerCase() === 'ok' ? 'Continue' : 'Cancel'}</Text>
      </Button>
    </Stack>
  )
}
