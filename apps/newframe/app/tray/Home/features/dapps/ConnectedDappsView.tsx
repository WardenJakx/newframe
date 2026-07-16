import svg from '../../../../../resources/svg'
import { activateOnKeyboard } from '../../ui/keyboard'

export interface ConnectedDappRow {
  id: string
  origin: string
}

export function ConnectedDappsView({
  dapps,
  onBack,
  onClear,
  onClearAll
}: {
  dapps: ConnectedDappRow[]
  onBack: () => void
  onClear: (originId: string) => void
  onClearAll: () => void
}) {
  return (
    <div aria-label='Dapps' className='t2Overlay cardShow' role='dialog'>
      <div className='t2OverlayHeader'>
        <div
          aria-label='Back'
          className='t2OverlayBack'
          onClick={onBack}
          onKeyDown={(event) => activateOnKeyboard(event, onBack)}
          role='button'
          tabIndex={0}
        >
          {svg.chevronLeft(16)}
        </div>
        <div className='t2OverlayTitle'>Dapps</div>
        {dapps.length ? (
          <div
            aria-label='Clear all connected websites'
            className='t2DappsClearAll'
            onClick={onClearAll}
            onKeyDown={(event) => activateOnKeyboard(event, onClearAll)}
            role='button'
            tabIndex={0}
            title='Clear all connected websites'
          >
            {svg.trash(13)}
          </div>
        ) : (
          <div className='t2OverlaySpacer' />
        )}
      </div>
      <div className='t2OverlayScroll t2DappsScroll'>
        {dapps.length === 0 ? (
          <div className='t2EmptyState'>No Connected Websites</div>
        ) : (
          dapps.map((dapp) => (
            <div key={dapp.id} className='t2DappRow'>
              <div className='t2DappOrigin'>{dapp.origin}</div>
              <div
                aria-label={`Clear ${dapp.origin}`}
                className='t2DappClear'
                onClick={() => onClear(dapp.id)}
                onKeyDown={(event) => activateOnKeyboard(event, () => onClear(dapp.id))}
                role='button'
                tabIndex={0}
                title={`Clear ${dapp.origin}`}
              >
                {svg.trash(13)}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
