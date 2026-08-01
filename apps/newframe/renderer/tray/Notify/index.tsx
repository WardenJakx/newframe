import type { ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Button } from '@newframe/ui/button'
import { Dialog } from '@newframe/ui/dialog'
import { Stack } from '@newframe/ui/stack'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'
import { ToggleButton } from '@newframe/ui/toggle-button'

import link from '../../shared/link'
import { capitalize } from '../../../domain/text'
import ExtensionConnectNotification from './ExtensionConnect'
import SignerRecovery from './SignerRecovery'
import { useWalletSelector } from '../../state/useAppSelector'
import type { TrayRendererState } from '../state'
import { useTrayNotification, type TrayNotifier } from '../notification'
import type { TransactionRequest } from '../../../contracts/requests'
const isNotificationData = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

type NotificationData = {
  req?: TransactionRequest
  feeUSD?: string
  currentSymbol?: string
  compatibility?: { signer?: string; tx?: string; compatible?: boolean }
  chain?: { type: 'ethereum'; id: string | number }
  hash?: string
  signerIds?: string[]
}

type NotificationProps = {
  data: NotificationData
  dismiss: TrayNotifier
  mute: TrayRendererState['mute']
  networks: TrayRendererState['networks']
  networksMeta: TrayRendererState['networksMeta']
  assetRates: TrayRendererState['assetRates']
}

function Shell({ children, dismiss }: { children: ReactNode; dismiss: TrayNotifier }) {
  return (
    <Dialog label='Newframe notification' onDismiss={() => dismiss()} padding='large' width='compact'>
      <Stack gap='large'>{children}</Stack>
    </Dialog>
  )
}

function NotificationTitle({ children }: { children: ReactNode }) {
  return (
    <Text align='center' variant='heading'>
      {children}
    </Text>
  )
}

function NotificationBody({ children }: { children: ReactNode }) {
  return (
    <Surface padding='medium' radius='card' tone='raised'>
      <Stack align='center' gap='small'>
        {children}
      </Stack>
    </Surface>
  )
}

function NotificationActions({
  dismiss,
  onProceed,
  proceedLabel = 'Proceed'
}: {
  dismiss: TrayNotifier
  onProceed?: () => void
  proceedLabel?: string
}) {
  if (!onProceed) {
    return (
      <Button appearance='primary' onPress={() => dismiss()} shape='pill' width='full'>
        <Text variant='action'>{proceedLabel}</Text>
      </Button>
    )
  }

  return (
    <Stack direction='row' equal gap='small'>
      <Button appearance='control' onPress={() => dismiss()} shape='pill'>
        <Text variant='action'>Cancel</Text>
      </Button>
      <Button appearance='primary' onPress={onProceed} shape='pill'>
        <Text variant='action'>{proceedLabel}</Text>
      </Button>
    </Stack>
  )
}

function WarningMute({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
  return (
    <Stack align='center' direction='row' justify='between'>
      <Text tone='secondary' variant='supporting'>
        Don&apos;t show this warning again
      </Text>
      <ToggleButton
        appearance='switch'
        label="Don't show this warning again"
        onPress={onToggle}
        pressed={checked}
      />
    </Stack>
  )
}

function confirmWarning(req: { handlerId?: string } | undefined, gate: 'signer-compatibility' | 'gas-fee') {
  if (req?.handlerId) {
    void link.executeCommand({ type: 'request.warning-confirm', requestId: req.handlerId, gate })
  }
}

function GasFeeWarning({ data, dismiss, mute }: NotificationProps) {
  const { req, feeUSD = '0.00', currentSymbol = 'ETH' } = data
  const proceed = () => {
    confirmWarning(req, 'gas-fee')
    dismiss()
  }

  return (
    <Shell dismiss={dismiss}>
      <NotificationTitle>Gas Fee Warning</NotificationTitle>
      <NotificationBody>
        <Text align='center' tone='secondary'>
          {feeUSD !== '0.00'
            ? 'The max fee for this transaction is:'
            : "We were unable to determine this transaction's fee in USD."}
        </Text>
        {feeUSD !== '0.00' ? (
          <Text align='center' variant='output'>{`≈ $${feeUSD} in ${currentSymbol}`}</Text>
        ) : null}
        <Text align='center' variant='label'>
          Are you sure you want to proceed?
        </Text>
      </NotificationBody>
      <NotificationActions dismiss={dismiss} onProceed={proceed} />
      <WarningMute
        checked={mute.gasFeeWarning}
        onToggle={() => void link.executeCommand({ type: 'warning.toggle', warning: 'gas-fee' })}
      />
    </Shell>
  )
}

function NoSignerWarning({ dismiss }: NotificationProps) {
  return (
    <Shell dismiss={dismiss}>
      <NotificationTitle>No Signer Attached</NotificationTitle>
      <NotificationBody>
        <Text align='center'>No signer is attached to this account.</Text>
        <Text align='center' tone='secondary'>
          Attach a signer that can sign for this account.
        </Text>
      </NotificationBody>
      <NotificationActions dismiss={dismiss} proceedLabel='OK' />
    </Shell>
  )
}

function SignerCompatibilityWarning({ data, dismiss, mute }: NotificationProps) {
  const { req, compatibility = {} } = data
  const { signer = '', tx = '' } = compatibility

  const proceed = () => {
    if (!req) return
    confirmWarning(req, 'signer-compatibility')
    dismiss()
  }

  return (
    <Shell dismiss={dismiss}>
      <NotificationTitle>Signer Compatibility</NotificationTitle>
      <NotificationBody>
        <Text align='center' tone='secondary'>
          {`Your ${capitalize(signer)} is not compatible with ${capitalize(tx)} ${
            tx === 'london' ? '(EIP-1559) ' : ''
          }transactions. The transaction will be converted to a legacy transaction before signing.`}
        </Text>
        {['lattice', 'ledger'].includes(signer) ? (
          <Text align='center' tone='warning' variant='supporting'>
            {`Update your ${capitalize(signer)} to enable compatibility.`}
          </Text>
        ) : null}
        <Text align='center' variant='label'>
          Do you want to proceed?
        </Text>
      </NotificationBody>
      <NotificationActions dismiss={dismiss} onProceed={proceed} />
      <WarningMute
        checked={mute.signerCompatibilityWarning}
        onToggle={() => void link.executeCommand({ type: 'warning.toggle', warning: 'signer-compatibility' })}
      />
    </Shell>
  )
}

function OpenExplorer({ data, dismiss, mute, networks }: NotificationProps) {
  const { hash, chain = { type: 'ethereum', id: 0 } } = data
  const { name: chainName, explorer: explorerUrl } = networks[chain.type]?.[Number(chain.id)] || {}
  const proceed = () => {
    void link.executeCommand({
      type: 'explorer.open',
      chainId: Number(chain.id),
      ...(hash ? { transactionHash: hash } : {})
    })
    dismiss()
  }

  return (
    <Shell dismiss={dismiss}>
      <NotificationTitle>Open Block Explorer</NotificationTitle>
      <NotificationBody>
        <Text align='center' tone='secondary'>
          {hash
            ? 'Newframe will open a block explorer for this transaction:'
            : `Newframe will open the ${chainName || 'network'} block explorer:`}
        </Text>
        <Text align='center' variant='code'>
          {hash || explorerUrl || 'Unknown explorer'}
        </Text>
      </NotificationBody>
      <NotificationActions dismiss={dismiss} onProceed={proceed} />
      <WarningMute
        checked={mute.explorerWarning}
        onToggle={() => void link.executeCommand({ type: 'warning.toggle', warning: 'explorer' })}
      />
    </Shell>
  )
}

const selectNotificationState = (state: TrayRendererState) => ({
  extensionRequestData:
    state.view.notify === 'extensionConnect' && isNotificationData(state.view.notifyData)
      ? state.view.notifyData
      : undefined,
  mute: state.mute,
  networks: state.networks,
  networksMeta: state.networksMeta,
  assetRates: state.assetRates
})

export default function Notification() {
  const state = useWalletSelector(useShallow(selectNotificationState))
  const local = useTrayNotification()

  if (state.extensionRequestData) {
    const { browser, id } = state.extensionRequestData
    if (typeof browser !== 'string' || typeof id !== 'string') return null
    return <ExtensionConnectNotification browser={browser} id={id} />
  }

  const props: NotificationProps = {
    data: local.data as NotificationData,
    dismiss: local.notify,
    mute: state.mute,
    networks: state.networks,
    networksMeta: state.networksMeta,
    assetRates: state.assetRates
  }

  if (local.type === 'gasFeeWarning') return <GasFeeWarning {...props} />
  if (local.type === 'noSignerWarning') return <NoSignerWarning {...props} />
  if (local.type === 'signerCompatibilityWarning') return <SignerCompatibilityWarning {...props} />
  if (local.type === 'signerRecovery') {
    return (
      <Shell dismiss={local.notify}>
        <SignerRecovery dismiss={local.notify} signerIds={dataSignerIds(local.data)} />
      </Shell>
    )
  }
  if (local.type === 'openExplorer') return <OpenExplorer {...props} />
  return null
}

function dataSignerIds(data: Record<string, unknown>) {
  return Array.isArray(data.signerIds)
    ? data.signerIds.filter((value): value is string => typeof value === 'string')
    : []
}
