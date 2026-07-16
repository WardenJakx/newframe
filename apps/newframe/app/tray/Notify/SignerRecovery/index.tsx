import React, { useEffect, useMemo, useState } from 'react'

import link from '../../../../resources/link'
import svg from '../../../../resources/svg'
import { useWalletSelector } from '../../../state/useAppSelector'
import type { TrayRendererState } from '../../state'
import type { TrayNotifier } from '../../notification'

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
      <div className='signerRecoveryActions'>
        <div aria-label='Trezor PIN' className='signerRecoveryPinValue'>
          {'•'.repeat(trezorPin.length) || ' '}
        </div>
        <div className='signerRecoveryPinGrid'>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((position) => (
            <button
              aria-label={`PIN position ${position}`}
              key={position}
              onClick={() => setTrezorPin((value) => value + position)}
              type='button'
            >
              {svg.octicon('primitive-dot', { height: 18 })}
            </button>
          ))}
        </div>
        <div className='signerRecoveryButtonRow'>
          <button
            disabled={!trezorPin}
            onClick={() => setTrezorPin((value) => value.slice(0, -1))}
            type='button'
          >
            Delete
          </button>
          <button disabled={!trezorPin} onClick={submitPin} type='button'>
            Submit PIN
          </button>
        </div>
      </div>
    )
  }

  if (signer.type === 'trezor' && status === 'enter passphrase') {
    const allowsDeviceEntry = (signer.capabilities || []).includes('Capability_PassphraseEntry')
    return (
      <div className='signerRecoveryActions'>
        <input
          aria-label='Trezor passphrase'
          autoFocus
          onChange={(event) => setTrezorPassphrase(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submitPassphrase()
          }}
          type='password'
          value={trezorPassphrase}
        />
        <button onClick={submitPassphrase} type='button'>
          Submit Passphrase
        </button>
        {allowsDeviceEntry ? (
          <button
            onClick={() =>
              void link.executeCommand({
                type: 'signer.trezor-input',
                signerId: signer.id,
                input: 'device-passphrase'
              })
            }
            type='button'
          >
            Enter on Device
          </button>
        ) : null}
      </div>
    )
  }

  if (signer.type === 'lattice' && status === 'pair') {
    return (
      <div className='signerRecoveryActions'>
        <input
          aria-label='Lattice pairing code'
          autoFocus
          onChange={(event) => setLatticePairCode(event.target.value.toUpperCase())}
          onKeyDown={(event) => {
            if (event.key === 'Enter') pairLattice()
          }}
          value={latticePairCode}
        />
        <button disabled={!latticePairCode} onClick={pairLattice} type='button'>
          Pair Lattice
        </button>
      </div>
    )
  }

  if (isLoading(status))
    return <div aria-label='Connecting hardware wallet' className='signerRecoveryLoader' />

  const canReload = signer.type !== 'trezor' || status === 'disconnected' || status.includes('reconnect')
  return canReload ? (
    <div className='signerRecoveryActions'>
      <button onClick={reload} type='button'>
        Retry Connection
      </button>
    </div>
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
    <div aria-label='Hardware wallet recovery' className='signerRecovery' role='dialog'>
      <div className='notifyTitle'>Hardware Wallet</div>
      {candidates.length > 1 ? (
        <div aria-label='Hardware wallets' className='signerRecoveryCandidates' role='group'>
          {candidates.map((candidate) => (
            <button
              aria-pressed={candidate.id === signer?.id}
              key={candidate.id}
              onClick={() => setSelectedId(candidate.id)}
              type='button'
            >
              {candidate.name}
            </button>
          ))}
        </div>
      ) : null}
      {signer ? (
        <>
          <div className='signerRecoveryIdentity'>
            <div className='signerRecoveryIcon'>{signerIcon(signer.type)}</div>
            <div>{signer.name}</div>
          </div>
          <div
            className={
              signer.status.toLowerCase() === 'ok' ? 'signerRecoveryStatus ready' : 'signerRecoveryStatus'
            }
          >
            {signerStatus(signer)}
          </div>
          <RecoveryActions key={signer.id} signer={signer} />
          {signer.status.toLowerCase() === 'ok' ? (
            <div className='notifyBody'>Return to the request and select Sign again.</div>
          ) : null}
        </>
      ) : (
        <div className='notifyBody'>The hardware wallet is no longer available.</div>
      )}
      <div className='signerRecoveryFooter'>
        <button onClick={() => dismiss()} type='button'>
          {signer?.status.toLowerCase() === 'ok' ? 'Continue' : 'Cancel'}
        </button>
      </div>
    </div>
  )
}
