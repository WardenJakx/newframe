import link from '../../../resources/link'
import { useWalletSelector } from '../../state/useAppSelector'
import type { TrayRendererState } from '../state'

const EMPTY_BADGE = {}
const selectBadge = (state: TrayRendererState) => state.view.badge || EMPTY_BADGE

export default function Badge() {
  const badge = useWalletSelector(selectBadge) as { type?: string; version?: string }

  if (badge.type === 'updateReady') {
    return (
      <div className='badgeWrap'>
        <div className='badge cardShow' style={{ transform: 'translateY(0px)', height: '196px' }}>
          <div className='badgeInner'>
            <div className='badgeMessage'>Your update is ready, restart Newframe to switch?</div>
            <div className='badgeInput'>
              <div className='badgeInputButton'>
                <div
                  className='badgeInputInner'
                  onMouseDown={() => void link.executeCommand({ type: 'updater.respond', action: 'restart' })}
                  style={{ color: 'var(--color-action-primary)' }}
                >
                  Restart Now
                </div>
              </div>
            </div>
            <div className='badgeInput'>
              <div className='badgeInputButton'>
                <div
                  className='badgeInputInner'
                  onMouseDown={() =>
                    void link.executeCommand({ type: 'updater.respond', action: 'dismiss-ready' })
                  }
                  style={{ color: 'var(--color-status-danger)' }}
                >
                  Restart Later
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  } else if (badge.type === 'updateAvailable') {
    return (
      <div className='badgeWrap'>
        <div className='badge cardShow' style={{ transform: 'translateY(0px)', height: '224px' }}>
          <div className='badgeInner'>
            <div className='badgeMessage'>
              Version {badge.version} is available, would you like to install it?
            </div>
            <div className='badgeInput'>
              <div className='badgeInputButton'>
                <div
                  className='badgeInputInner'
                  onMouseDown={() => void link.executeCommand({ type: 'updater.respond', action: 'install' })}
                  style={{ color: 'var(--color-action-primary)' }}
                >
                  Install Update
                </div>
              </div>
            </div>
            <div className='badgeInput'>
              <div className='badgeInputButton'>
                <div
                  className='badgeInputInner'
                  onMouseDown={() => void link.executeCommand({ type: 'updater.respond', action: 'later' })}
                  style={{ color: 'var(--color-status-danger)' }}
                >
                  Remind Me Later
                </div>
              </div>
            </div>
            <div className='badgeInput'>
              <div className='badgeInputButton'>
                <div
                  className='badgeInputInner badgeInputSmall'
                  onMouseDown={() => void link.executeCommand({ type: 'updater.respond', action: 'skip' })}
                >
                  Skip This Version
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  } else {
    return null
  }
}
