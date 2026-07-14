import { useCallback } from 'react'
import link from '../../../resources/link'
import svg from '../../../resources/svg'
import { useWalletSelector } from '../../state/useAppSelector'
import type { DashNavigationEntry, DashRendererState, DashSigner } from '../state'

const EMPTY_DASH_NAV: DashNavigationEntry[] = []

const selectDashNavigation = (state: DashRendererState) => state.windows?.dash?.nav || EMPTY_DASH_NAV

function renderSignerIcon(type?: string) {
  if (type === 'ledger') {
    return <div className='expandedSignerIcon'>{svg.ledger(20)}</div>
  } else if (type === 'trezor') {
    return <div className='expandedSignerIcon'>{svg.trezor(20)}</div>
  } else if (type === 'seed' || type === 'ring') {
    return <div className='expandedSignerIcon'>{svg.flame(23)}</div>
  } else if (type === 'lattice') {
    return <div className='expandedSignerIcon'>{svg.lattice(22)}</div>
  } else {
    return <div className='expandedSignerIcon'>{svg.logo(20)}</div>
  }
}

function renderSignerTitle(signer?: DashSigner) {
  if (!signer) return null

  return (
    <div className='expandedSignerTitle'>
      {renderSignerIcon(signer.type)}
      <div className='signerName'>{signer.name}</div>
    </div>
  )
}

export default function Command() {
  const navigation = useWalletSelector(selectDashNavigation)
  const { view = '', data = {} } = navigation[0] || {}
  const signerId = data.signer
  const selectSigner = useCallback(
    (state: DashRendererState) => (signerId ? state.signers[signerId] : undefined),
    [signerId]
  )
  const signer = useWalletSelector(selectSigner)

  return (
    <div className='command'>
      {navigation.length ? (
        <div
          className='commandItem commandItemBack cardShow'
          onClick={() => {
            void link.executeCommand({ type: 'dash.back', steps: 1 })
          }}
        >
          {svg.chevronLeft(16)}
        </div>
      ) : null}
      <div key={view} className='commandTitle cardShow'>
        {view === 'expandedSigner' ? renderSignerTitle(signer) : view}
      </div>
      <div
        className='commandItem commandItemClose'
        onClick={() => {
          void link.executeCommand({ type: 'dash.close' })
        }}
      >
        {svg.x(16)}
      </div>
    </div>
  )
}
