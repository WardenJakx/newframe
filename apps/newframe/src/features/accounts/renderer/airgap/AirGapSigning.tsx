import { Button } from '@newframe/ui/button'
import { Stack } from '@newframe/ui/stack'
import { Text } from '@newframe/ui/text'
import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import type { QrCameraCapability } from '../../../../platform/desktop/renderer/camera'
import type { AirGapRequestReference } from '../../../../platform/signing/domain/airgap'
import { useWalletSelector } from '../../../../platform/state-sync/renderer/useAppSelector'
import type { AccountsCapability } from '../accountsCapability'
import { QrCodeSequence } from './QrCodeSequence'
import { QrScanner } from './QrScanner'

export function AirGapSigning({
  capability,
  camera,
  reference,
  dismiss
}: {
  capability: AccountsCapability
  camera: QrCameraCapability
  reference: AirGapRequestReference
  dismiss(): void
}) {
  const { signerId, requestId, sessionId } = reference
  const { live, active, progress } = useWalletSelector(
    useShallow((state) => {
      const pending = state.signers[signerId]?.airgapRequest
      return {
        live: !state.appLock.locked && pending?.requestId === requestId && pending.sessionId === sessionId,
        active: state.tray.open && !state.appLock.locked,
        progress: pending?.progress ?? 0
      }
    })
  )
  const [closed, setClosed] = useState(false)
  const stillLive = live && !closed
  const open = useRef(stillLive)
  const dismissRef = useRef(dismiss)
  useEffect(() => {
    dismissRef.current = dismiss
  }, [dismiss])
  const [frames, setFrames] = useState<string[]>([])
  const [error, setError] = useState('')
  const [scanStage, setScanStage] = useState<'qr' | 'opening' | 'scanning'>('qr')
  const [scanError, setScanError] = useState('')
  const scanning = scanStage === 'scanning'
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!stillLive) {
      open.current = false
      dismissRef.current()
    }
  }, [stillLive])
  useEffect(() => {
    return () => {
      open.current = false
      void capability.finishSignerSession({ signerId, requestId, sessionId }).catch(() => {})
    }
  }, [capability, signerId, requestId, sessionId])
  useEffect(() => {
    if (!stillLive || !open.current) {
      return
    }
    let current = true
    void capability
      .sessionFrames({ signerId, requestId, sessionId })
      .then((result) => {
        if (!current || !open.current) {
          return
        }
        if (!result.ok) {
          throw new Error(result.message ?? 'Signing QR unavailable. Retry or cancel.')
        }
        if (!result.frames.length) {
          throw new Error('Signing QR unavailable. Retry or cancel.')
        }
        setFrames(result.frames)
      })
      .catch((reason: unknown) => {
        if (current && open.current) {
          setError(reason instanceof Error ? reason.message : 'Could not load signing QR')
        }
      })
    return () => {
      current = false
    }
  }, [capability, signerId, requestId, sessionId, stillLive, attempt])
  function close() {
    open.current = false
    setClosed(true)
    void capability.finishSignerSession({ signerId, requestId, sessionId }).catch(() => {})
    dismissRef.current()
  }
  if (!stillLive) {
    return null
  }
  let requestQr = <Text>Loading signing QR</Text>
  if (error) {
    requestQr = (
      <>
        <div role='alert'>
          <Text tone='danger'>{error}</Text>
        </div>
        <Button
          appearance='control'
          onPress={() => {
            setError('')
            setAttempt((value) => value + 1)
          }}
        >
          Retry QR
        </Button>
      </>
    )
  } else if (frames.length) {
    requestQr = <QrCodeSequence active={active} frames={frames} />
  }
  return (
    <Stack gap='medium'>
      <Text align='center' variant='heading'>
        Sign with AirGap Vault
      </Text>
      {!scanning && (
        <>
          <Text variant='supporting'>
            Scan this request in Vault. Review and approve it manually on your phone, then show Newframe the
            signed QR.
          </Text>
          {requestQr}
          {scanError ? (
            <div role='alert'>
              <Text tone='danger'>{scanError}</Text>
            </div>
          ) : null}
          <Button
            appearance='primary'
            disabled={!frames.length || !active || scanStage === 'opening'}
            onPress={() => {
              setScanError('')
              setScanStage('opening')
            }}
          >
            {scanStage === 'opening' ? 'Opening camera' : 'Scan signed QR'}
          </Button>
        </>
      )}
      {scanStage !== 'qr' && (
        <div hidden={!scanning}>
          <Stack gap='medium'>
            <Text variant='supporting'>Show the signed QR from Vault to this camera.</Text>
            <QrScanner
              active={active}
              camera={camera}
              onReady={() => {
                if (open.current) {
                  setScanStage('scanning')
                }
              }}
              onError={(message) => {
                if (!open.current) {
                  return
                }
                setScanError(message)
                setScanStage('qr')
              }}
              onFrame={async (frame) => {
                if (!open.current) {
                  return
                }
                const result = await capability.inputSignerSession({ signerId, requestId, sessionId, frame })
                if (!result.ok) {
                  throw new Error(result.message ?? 'Invalid signature QR. Retry or cancel.')
                }
              }}
            />
            <Text aria-live='polite' variant='supporting'>
              Receiving signature: {Math.round(progress * 100)}%
            </Text>
            <Button appearance='control' onPress={() => setScanStage('qr')}>
              Back to QR
            </Button>
          </Stack>
        </div>
      )}
      <Button appearance='control' onPress={close}>
        Cancel
      </Button>
    </Stack>
  )
}
