import type { ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'

import svg from '../../../resources/svg'
import { toBigInt } from '../../../resources/utils/numbers'
import link from '../../../resources/link'
import { usesBaseFee } from '../../../resources/domain/transaction'
import { capitalize } from '../../../resources/utils'
import ExtensionConnectNotification from './ExtensionConnect'
import { useWalletSelector } from '../../state/useAppSelector'
import type { TrayRendererState } from '../state'
import { useTrayNotification, type TrayNotifier } from '../notification'
import type { TransactionRequest } from '../../../main/accounts/types'

const FEE_WARNING_THRESHOLD_USD = 50
const isNotificationData = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

type NotificationData = {
  req?: TransactionRequest
  feeUSD?: string
  currentSymbol?: string
  compatibility?: {
    signer?: string
    tx?: string
    compatible?: boolean
  }
  chain?: {
    type: 'ethereum'
    id: string | number
  }
  hash?: string
}

type NotificationProps = {
  data: NotificationData
  dismiss: TrayNotifier
  mute: TrayRendererState['mute']
  networks: TrayRendererState['networks']
  networksMeta: TrayRendererState['networksMeta']
}

function Shell({ children, dismiss }: { children: ReactNode; dismiss: TrayNotifier }) {
  return (
    <div className='notify cardShow' onMouseDown={() => dismiss()}>
      <div className='notifyBoxWrap' onMouseDown={(event) => event.stopPropagation()}>
        <div className='notifyBox'>{children}</div>
      </div>
    </div>
  )
}

function approveRequest(req?: { handlerId?: string }) {
  if (req?.handlerId) {
    void link.executeCommand({ type: 'request.approve', requestId: req.handlerId })
  }
}

function GasFeeWarning({ data, dismiss, mute }: NotificationProps) {
  const { req, feeUSD = '0.00', currentSymbol = 'ETH' } = data

  return (
    <Shell dismiss={dismiss}>
      <div className='notifyTitle'>Gas Fee Warning</div>
      <div className='notifyBody'>
        {feeUSD !== '0.00' ? (
          <>
            <div className='notifyBodyLine'>The max fee for this transaction is:</div>
            <div className='notifyBodyLine notifyBodyPrice'>{`≈ $${feeUSD} in ${currentSymbol}`}</div>
          </>
        ) : (
          <div className='notifyBodyLine'>
            We were unable to determine this transaction&apos;s fee in USD.
          </div>
        )}
        <div className='notifyBodyQuestion'>Are you sure you want to proceed?</div>
      </div>
      <div className='notifyInput'>
        <div className='notifyInputOption notifyInputDeny' onMouseDown={() => dismiss()}>
          <div className='notifyInputOptionText'>Cancel</div>
        </div>
        <div
          className='notifyInputOption notifyInputProceed'
          onMouseDown={() => {
            approveRequest(req)
            dismiss()
          }}
        >
          <div className='notifyInputOptionText'>Proceed</div>
        </div>
      </div>
      <div
        className='notifyCheck'
        onMouseDown={() => void link.executeCommand({ type: 'warning.toggle', warning: 'gas-fee' })}
      >
        <div className='notifyCheckBox'>
          {mute.gasFeeWarning ? svg.octicon('check', { height: 26 }) : null}
        </div>
        <div className='notifyCheckText'>{"Don't show this warning again"}</div>
      </div>
    </Shell>
  )
}

function NoSignerWarning({ dismiss }: NotificationProps) {
  return (
    <Shell dismiss={dismiss}>
      <div className='notifyTitle'>No Signer Attached!</div>
      <div className='notifyBody'>
        <div className='notifyBodyLine'>No signer attached for this account</div>
        <div className='notifyBodyQuestion'>Please attach a signer that can sign for this account</div>
      </div>
      <div className='notifyInput'>
        <div className='notifyInputOption notifyInputSingleButton' onMouseDown={() => dismiss()}>
          <div className='notifyInputOptionText'>OK</div>
        </div>
      </div>
    </Shell>
  )
}

const displayUSD = (usd: number) => (Math.ceil(usd * 100) / 100).toFixed(2)

function SignerCompatibilityWarning({ data, dismiss, mute, networks, networksMeta }: NotificationProps) {
  const { req, compatibility = {}, chain = { type: 'ethereum', id: 0 } } = data
  const { signer = '', tx = '' } = compatibility

  const proceed = () => {
    if (!req) return
    const chainId = Number(chain.id)
    const isTestnet = networks[chain.type]?.[chainId]?.isTestnet
    const nativeCurrency = networksMeta[chain.type]?.[chainId]?.nativeCurrency
    const currentSymbol = nativeCurrency?.symbol || '?'
    const nativeUSD = nativeCurrency?.usd && !isTestnet ? nativeCurrency.usd.price : undefined
    const hasNativeUSD = typeof nativeUSD === 'number'
    const gasLimit = toBigInt(req.data?.gasLimit) ?? 0n
    const maxFeePerGas = toBigInt(usesBaseFee(req.data) ? req.data.maxFeePerGas : req.data?.gasPrice) ?? 0n
    const maxFeeUSD = hasNativeUSD ? (Number(maxFeePerGas * gasLimit) / 1e18) * nativeUSD : 0

    if (
      hasNativeUSD &&
      (maxFeeUSD > FEE_WARNING_THRESHOLD_USD || displayUSD(maxFeeUSD) === '0.00') &&
      !mute.gasFeeWarning
    ) {
      dismiss('gasFeeWarning', { req, feeUSD: displayUSD(maxFeeUSD), currentSymbol })
    } else {
      approveRequest(req)
      dismiss()
    }
  }

  return (
    <Shell dismiss={dismiss}>
      <div className='notifyTitle'>Signer Compatibility</div>
      <div className='notifyBody'>
        <div className='notifyBodyLine'>
          {`Your ${capitalize(signer)} is not compatible with ${capitalize(tx)} ${
            tx === 'london' ? '(EIP-1559) ' : ''
          }transactions. Your transaction will be converted to a legacy transaction before signing.`}
        </div>
        {['lattice', 'ledger'].includes(signer) ? (
          <div className='notifyBodyUpdate'>
            {`Update your ${capitalize(signer)} to enable compatibility`}
          </div>
        ) : null}
        <div className='notifyBodyQuestion'>Do you want to proceed?</div>
      </div>
      <div className='notifyInput'>
        <div className='notifyInputOption notifyInputDeny' onMouseDown={() => dismiss()}>
          <div className='notifyInputOptionText'>Cancel</div>
        </div>
        <div className='notifyInputOption notifyInputProceed' onMouseDown={proceed}>
          <div className='notifyInputOptionText'>Proceed</div>
        </div>
      </div>
      <div
        className='notifyCheck'
        onMouseDown={() =>
          void link.executeCommand({ type: 'warning.toggle', warning: 'signer-compatibility' })
        }
      >
        <div className='notifyCheckBox'>
          {mute.signerCompatibilityWarning ? svg.octicon('check', { height: 26 }) : null}
        </div>
        <div className='notifyCheckText'>{"Don't show this warning again"}</div>
      </div>
    </Shell>
  )
}

function OpenExplorer({ data, dismiss, mute, networks }: NotificationProps) {
  const { hash, chain = { type: 'ethereum', id: 0 } } = data
  const { name: chainName, explorer: explorerUrl } = networks[chain.type]?.[Number(chain.id)] || {}

  return (
    <Shell dismiss={dismiss}>
      <div className='notifyTitle'>Open Block Explorer</div>
      <div className='notifyBody'>
        {hash ? (
          <>
            <div className='notifyBodyLine'>
              Newframe will open a block explorer in your browser for transaction:
            </div>
            <div className='notifyBodyHash'>{hash}</div>
          </>
        ) : (
          <>
            <div className='notifyBodyLine'>{`Newframe will open the ${chainName}`}</div>
            <div className='notifyBodyLine'>block explorer in your browser:</div>
            <div className='notifyBodyHash'>{explorerUrl}</div>
          </>
        )}
      </div>
      <div className='notifyInput'>
        <div className='notifyInputOption notifyInputDeny' onMouseDown={() => dismiss()}>
          <div className='notifyInputOptionText'>Cancel</div>
        </div>
        <div
          className='notifyInputOption notifyInputProceed'
          onMouseDown={() => {
            void link.executeCommand({
              type: 'explorer.open',
              chainId: Number(chain.id),
              ...(hash ? { transactionHash: hash } : {})
            })
            dismiss()
          }}
        >
          <div className='notifyInputOptionText'>Proceed</div>
        </div>
      </div>
      <div
        className='notifyCheck'
        onMouseDown={() => void link.executeCommand({ type: 'warning.toggle', warning: 'explorer' })}
      >
        <div className='notifyCheckBox'>
          {mute.explorerWarning ? svg.octicon('check', { height: 26 }) : null}
        </div>
        <div className='notifyCheckText'>{"Don't show this warning again"}</div>
      </div>
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
  networksMeta: state.networksMeta
})

export default function Notification() {
  const state = useWalletSelector(useShallow(selectNotificationState))
  const local = useTrayNotification()

  if (state.extensionRequestData) {
    const { browser, id } = state.extensionRequestData
    if (typeof browser !== 'string' || typeof id !== 'string') return null
    return <ExtensionConnectNotification browser={browser} id={id} onClose={() => local.notify()} />
  }

  const props: NotificationProps = {
    data: local.data as NotificationData,
    dismiss: local.notify,
    mute: state.mute,
    networks: state.networks,
    networksMeta: state.networksMeta
  }

  if (local.type === 'gasFeeWarning') return <GasFeeWarning {...props} />
  if (local.type === 'noSignerWarning') return <NoSignerWarning {...props} />
  if (local.type === 'signerCompatibilityWarning') return <SignerCompatibilityWarning {...props} />
  if (local.type === 'openExplorer') return <OpenExplorer {...props} />
  return null
}
