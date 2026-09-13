import { Button } from '@newframe/ui/button'
import { Stack } from '@newframe/ui/stack'
import { Text } from '@newframe/ui/text'
import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import type { QrCameraCapability } from '../../../../platform/desktop/renderer/camera'
import { useWalletSelector } from '../../../../platform/state-sync/renderer/useAppSelector'
import type { AccountsCapability } from '../accountsCapability'
import { QrScanner } from './QrScanner'

export function AirGapPairing({
  capability,
  camera,
  onPaired
}: {
  capability: AccountsCapability
  camera: QrCameraCapability
  onPaired(signerId: string): void
}) {
  const [operationId, setOperationId] = useState('')
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const owned = useRef('')
  const callback = useRef(onPaired)
  useEffect(() => {
    callback.current = onPaired
  }, [onPaired])
  const { operation, active, locked } = useWalletSelector(
    useShallow((state) => ({
      operation: state.operations[operationId],
      active: state.tray.open && !state.appLock.locked,
      locked: state.appLock.locked
    }))
  )
  const cancel = () => {
    const id = owned.current
    owned.current = ''
    if (id) void capability.finishSignerSession({ operationId: id }).catch(() => {})
  }
  useEffect(
    () => () => {
      const id = owned.current
      owned.current = ''
      if (id) void capability.finishSignerSession({ operationId: id }).catch(() => {})
    },
    [capability]
  )
  useEffect(() => {
    if (locked) {
      const id = owned.current
      owned.current = ''
      if (id) void capability.finishSignerSession({ operationId: id }).catch(() => {})
      queueMicrotask(() => {
        setOperationId('')
        setReady(false)
      })
    }
  }, [locked, capability])
  useEffect(() => {
    let current = true
    queueMicrotask(() => {
      if (!current || !operation || operation.id !== owned.current) return
      if (operation.status === 'succeeded' && operation.phase === 'paired') {
        const signerId = operation.entityRefs?.find((ref) => ref.type === 'signer')?.id
        if (signerId) {
          owned.current = ''
          callback.current(signerId)
        }
      } else if (operation.status !== 'pending') {
        owned.current = ''
        setOperationId('')
        setReady(false)
        if (operation.status === 'failed') setError(operation.error?.message || 'Pairing failed. Try again.')
      }
    })
    return () => {
      current = false
    }
  }, [operation])
  async function start() {
    cancel()
    const id = crypto.randomUUID()
    owned.current = id
    setOperationId(id)
    setReady(false)
    setError('')
    try {
      const result = await capability.importSigner({ source: 'airgap', operationId: id })
      if (owned.current !== id) return
      if (!result.ok) throw new Error(result.message || 'Could not start pairing')
      setReady(true)
    } catch (reason) {
      if (owned.current !== id) return
      cancel()
      setOperationId('')
      setError(reason instanceof Error ? reason.message : 'Could not start pairing')
    }
  }
  return (
    <Stack gap='small'>
      <Text variant='label'>Pair AirGap Vault</Text>
      <Text variant='supporting'>
        On your phone, export the Ethereum account from AirGap Vault using its MetaMask-compatible choice.
        Scan the public account QR here. Your keys stay on the phone.
      </Text>
      {error ? (
        <div role='alert'>
          <Text tone='danger'>{error}</Text>
        </div>
      ) : null}
      {ready && operationId ? (
        <QrScanner
          active={active}
          camera={camera}
          onError={(message) => {
            cancel()
            setOperationId('')
            setReady(false)
            setError(message)
          }}
          onFrame={async (frame) => {
            const id = owned.current
            if (!id) return
            const result = await capability.inputSignerSession({ operationId: id, frame })
            if (!result.ok)
              throw new Error(result.message || 'Invalid account QR. Retry with the Vault account export.')
          }}
        />
      ) : (
        <Button appearance='primary' disabled={!!operationId || locked} onPress={() => void start()}>
          {operationId ? 'Starting pairing' : 'Pair AirGap'}
        </Button>
      )}
      {operationId ? (
        <Button
          appearance='control'
          onPress={() => {
            cancel()
            setOperationId('')
            setReady(false)
          }}
        >
          Cancel pairing
        </Button>
      ) : null}
    </Stack>
  )
}
